import CommonCrypto
import Darwin
import Foundation
import Security

/**
 Serves the tracks and covers of a cast session to the receiver playing it.

 Port of CastServer.kt, whose URL shape, key derivation and response rules this has
 to match: JS builds the same session on both platforms. The socket, range and
 worker code come from modules/smb/ios/SmbBridge.swift.

 Not switched on yet (`isCastRelayAvailable` in services/castRelay.ts is Android-only):
 iOS suspends an app that isn't playing audio itself about 30 s after it leaves the
 foreground, and a suspended app serves nothing. Until that has an answer this only
 works with Wavio on screen, which needs testing before it is offered.
 */
final class CastServer: @unchecked Sendable {
  static let shared = CastServer()

  private static let backlog: Int32 = 16
  private static let maxWorkers = 8
  private static let headLimit = 16 * 1024
  private static let chunk = 256 * 1024
  private static let headTimeoutSeconds = 5
  private static let bodyTimeoutSeconds = 30
  private static let maxEntries = 16

  private static let dlnaAudio = (
    "Streaming", "DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000"
  )
  private static let dlnaImage = (
    "Interactive", "DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=00D00000000000000000000000000000"
  )

  private enum Source {
    case file(URL)
    case upstream(URL, [String: String])
  }

  private struct Entry {
    let source: Source
    let mime: String
  }

  private let lock = NSLock()
  private var listenFD: Int32 = -1
  private var port: UInt16 = 0
  private var boundHost: String?
  private var token: String?
  private var receiverHost: String?
  private var entries: [String: Entry] = [:]
  private var entryOrder: [String] = []
  private var counts: [String: Int] = [:]
  private var sessionRequests = 0
  private let gate = DispatchSemaphore(value: CastServer.maxWorkers)

  var requestEvents = false
  var onRequest: (([String: Any]) -> Void)?

  // MARK: - Public surface

  func startSession(receiverHost: String, preferredPort: Int, preferredToken: String?) -> [String: Any]? {
    let receiver = CastServer.literal(receiverHost)
    guard let host = CastServer.localAddress(toward: receiver) else { return nil }
    lock.lock()
    defer { lock.unlock() }
    let next = preferredToken.flatMap { CastServer.isToken($0) ? $0 : nil } ?? token ?? CastServer.newToken()
    if next != token {
      entries.removeAll()
      entryOrder.removeAll()
      counts.removeAll()
      sessionRequests = 0
    }
    token = next
    self.receiverHost = receiver
    guard let boundPort = ensureListening(host: host, preferredPort: preferredPort) else { return nil }
    return ["host": host, "port": Int(boundPort), "token": next]
  }

  func register(id: String, record: [String: Any], ext: String, mime: String) -> String? {
    guard let source = CastServer.source(from: record) else { return nil }
    lock.lock()
    defer { lock.unlock() }
    guard let current = token, let host = CastServer.localAddress(toward: receiverHost) else {
      return nil
    }
    guard let boundPort = ensureListening(host: host, preferredPort: Int(port)) else { return nil }
    let key = CastServer.key(token: current, id: id)
    entries[key] = Entry(source: source, mime: mime)
    entryOrder.removeAll { $0 == key }
    entryOrder.append(key)
    while entryOrder.count > CastServer.maxEntries {
      entries.removeValue(forKey: entryOrder.removeFirst())
    }
    let lowered = ext.lowercased()
    let suffix =
      (1...5).contains(lowered.count) && lowered.allSatisfy({ $0.isLetter || $0.isNumber })
      ? lowered : "bin"
    // IPv4 only: `localNetworkAddresses` never offers anything else, so no brackets.
    return "http://\(host):\(boundPort)/\(current)/\(key).\(suffix)"
  }

  func requestCount(url: String) -> Int {
    guard let path = URL(string: url)?.path, let key = keyOf(path) else { return 0 }
    lock.lock()
    defer { lock.unlock() }
    return counts[key] ?? 0
  }

  func sessionRequestCount() -> Int {
    lock.lock()
    defer { lock.unlock() }
    return sessionRequests
  }

  func endSession() {
    lock.lock()
    let fd = listenFD
    listenFD = -1
    port = 0
    boundHost = nil
    token = nil
    receiverHost = nil
    entries.removeAll()
    entryOrder.removeAll()
    counts.removeAll()
    sessionRequests = 0
    lock.unlock()
    if fd >= 0 { close(fd) }
  }

  // MARK: - Listener (call with `lock` held)

  private func ensureListening(host: String, preferredPort: Int) -> UInt16? {
    if listenFD >= 0, boundHost == host { return port }
    if listenFD >= 0 {
      close(listenFD)
      listenFD = -1
    }
    let candidates = (1024...65535).contains(preferredPort) ? [preferredPort, 0] : [0]
    for candidate in candidates {
      if let (fd, assigned) = CastServer.bind(host: host, port: UInt16(candidate)) {
        listenFD = fd
        port = assigned
        boundHost = host
        let accepter = Thread { [weak self] in self?.acceptLoop(fd) }
        accepter.name = "wavio-cast-accept"
        accepter.start()
        return assigned
      }
    }
    return nil
  }

  private static func bind(host: String, port: UInt16) -> (Int32, UInt16)? {
    let fd = socket(AF_INET, SOCK_STREAM, 0)
    guard fd >= 0 else { return nil }
    var reuse: Int32 = 1
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))
    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = port.bigEndian
    guard inet_pton(AF_INET, host, &address.sin_addr) == 1 else {
      close(fd)
      return nil
    }
    let bound = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    guard bound == 0, listen(fd, backlog) == 0 else {
      close(fd)
      return nil
    }
    var assigned = sockaddr_in()
    var length = socklen_t(MemoryLayout<sockaddr_in>.size)
    withUnsafeMutablePointer(to: &assigned) { pointer in
      _ = pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        getsockname(fd, $0, &length)
      }
    }
    return (fd, UInt16(bigEndian: assigned.sin_port))
  }

  private func acceptLoop(_ fd: Int32) {
    while true {
      var clientAddress = sockaddr_in()
      var length = socklen_t(MemoryLayout<sockaddr_in>.size)
      let client = withUnsafeMutablePointer(to: &clientAddress) { pointer in
        pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
          accept(fd, $0, &length)
        }
      }
      if client < 0 {
        if errno == EINTR { continue }
        break
      }
      if gate.wait(timeout: .now()) == .timedOut {
        close(client)
        continue
      }
      let from = CastServer.string(clientAddress.sin_addr)
      let worker = Thread { [weak self] in
        defer { self?.gate.signal() }
        self?.serve(client, from: from)
      }
      worker.name = "wavio-cast-server"
      worker.start()
    }
    lock.lock()
    let owned = listenFD == fd
    if owned {
      listenFD = -1
      port = 0
      boundHost = nil
    }
    lock.unlock()
    if owned { close(fd) }
  }

  // MARK: - One request

  private func serve(_ fd: Int32, from client: String) {
    defer { close(fd) }
    var enable: Int32 = 1
    // A receiver hanging up mid-body would otherwise raise SIGPIPE and take the app
    // down: every seek abandons a connection.
    setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &enable, socklen_t(MemoryLayout<Int32>.size))
    setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &enable, socklen_t(MemoryLayout<Int32>.size))
    CastServer.setTimeouts(fd, seconds: CastServer.headTimeoutSeconds)
    guard let head = CastServer.readHead(fd) else { return }
    CastServer.setTimeouts(fd, seconds: CastServer.bodyTimeoutSeconds)

    let started = Date()
    let request = (head.first ?? "").split(separator: " ", omittingEmptySubsequences: false)
    var method = "?"
    var key: String?
    var range: String?
    var outcome = (status: 0, bytes: Int64(0))
    defer {
      report(client: client, method: method, key: key, range: range, outcome: outcome, started: started)
    }
    guard request.count >= 3 else {
      CastServer.respond(fd, 400, "Bad Request")
      outcome = (400, 0)
      return
    }
    method = request[0].uppercased()
    guard method == "GET" || method == "HEAD" else {
      CastServer.respond(fd, 405, "Method Not Allowed")
      outcome = (405, 0)
      return
    }
    let path = String(request[1]).components(separatedBy: "?")[0]
    key = keyOf(path)
    lock.lock()
    let entry = key.flatMap { entries[$0] }
    if let key, entry != nil {
      counts[key, default: 0] += 1
      sessionRequests += 1
    }
    lock.unlock()
    guard let entry else {
      CastServer.respond(fd, 404, "Not Found")
      outcome = (404, 0)
      return
    }
    range = CastServer.header(head, "range")
    let dlna = entry.mime.hasPrefix("image/") ? CastServer.dlnaImage : CastServer.dlnaAudio
    switch entry.source {
    case .file(let url):
      outcome = serveFile(fd, url: url, method: method, range: range, mime: entry.mime, dlna: dlna)
    case .upstream(let url, let headers):
      outcome = UpstreamRelay(fd: fd, method: method, mime: entry.mime, dlna: dlna)
        .run(url: url, headers: headers, range: range)
    }
  }

  private func serveFile(
    _ fd: Int32, url: URL, method: String, range: String?, mime: String, dlna: (String, String)
  ) -> (status: Int, bytes: Int64) {
    guard
      let handle = try? FileHandle(forReadingFrom: url),
      let size = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? NSNumber
    else {
      CastServer.respond(fd, 404, "Not Found")
      return (404, 0)
    }
    defer { try? handle.close() }
    let total = size.uint64Value
    guard let span = CastServer.parseRange(range, size: total) else {
      CastServer.respond(
        fd, 416, "Range Not Satisfiable", headers: [("Content-Range", "bytes */\(total)")])
      return (416, 0)
    }
    let length = span.upperBound - span.lowerBound
    let partial = range != nil
    var headers: [(String, String)] = [("Content-Type", mime), ("Accept-Ranges", "bytes")]
    if partial {
      headers.append(("Content-Range", "bytes \(span.lowerBound)-\(span.upperBound - 1)/\(total)"))
    }
    let status = partial ? 206 : 200
    CastServer.respond(
      fd, status, partial ? "Partial Content" : "OK", headers: headers,
      contentLength: Int64(length), dlna: dlna)
    guard method == "GET", length > 0 else { return (status, 0) }
    do {
      try handle.seek(toOffset: span.lowerBound)
    } catch {
      return (status, 0)
    }
    var remaining = length
    var sent: Int64 = 0
    while remaining > 0 {
      let want = Int(min(UInt64(CastServer.chunk), remaining))
      guard let data = try? handle.read(upToCount: want), !data.isEmpty else { break }
      if !CastServer.writeAll(fd, data) { break }
      remaining -= UInt64(data.count)
      sent += Int64(data.count)
    }
    return (status, sent)
  }

  private func report(
    client: String, method: String, key: String?, range: String?,
    outcome: (status: Int, bytes: Int64), started: Date
  ) {
    guard requestEvents, let onRequest else { return }
    lock.lock()
    let expected = receiverHost
    lock.unlock()
    onRequest([
      "client": client,
      "fromReceiver": expected == nil || expected == client,
      "method": method,
      "key": String((key ?? "").prefix(8)),
      "range": range as Any,
      "status": outcome.status,
      "bytes": Double(outcome.bytes),
      "ms": Date().timeIntervalSince(started) * 1000,
    ])
  }

  // MARK: - Keys and tokens

  private func keyOf(_ path: String) -> String? {
    var trimmed = path
    while trimmed.hasPrefix("/") { trimmed.removeFirst() }
    let segments = trimmed.split(separator: "/", omittingEmptySubsequences: false)
    guard segments.count == 2 else { return nil }
    lock.lock()
    let current = token
    lock.unlock()
    guard let current, CastServer.constantTimeEqual(current, String(segments[0])) else { return nil }
    let key = String(segments[1].split(separator: ".", maxSplits: 1)[0])
    return CastServer.isToken(key) ? key : nil
  }

  private static func isToken(_ value: String) -> Bool {
    value.count == 32 && value.allSatisfy { $0.isHexDigit && !$0.isUppercase }
  }

  private static func newToken() -> String {
    var bytes = [UInt8](repeating: 0, count: 16)
    if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
      for index in bytes.indices { bytes[index] = UInt8.random(in: .min ... .max) }
    }
    return bytes.map { String(format: "%02x", $0) }.joined()
  }

  /// SHA-256 of token, a zero byte and the id, as CastServer.kt derives it.
  private static func key(token: String, id: String) -> String {
    var input = Data(token.utf8)
    input.append(0)
    input.append(Data(id.utf8))
    var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    input.withUnsafeBytes { _ = CC_SHA256($0.baseAddress, CC_LONG(input.count), &digest) }
    return digest.prefix(16).map { String(format: "%02x", $0) }.joined()
  }

  private static func constantTimeEqual(_ lhs: String, _ rhs: String) -> Bool {
    let left = Array(lhs.utf8)
    let right = Array(rhs.utf8)
    if left.count != right.count { return false }
    var difference: UInt8 = 0
    for index in left.indices { difference |= left[index] ^ right[index] }
    return difference == 0
  }

  private static func source(from record: [String: Any]) -> Source? {
    switch record["kind"] as? String {
    case "local":
      // Only plain file URLs for now. A `local-folder://` library resolves through
      // modules/scoped-folders' security-scoped bookmarks, which this module can't
      // reach; JS doesn't register those until it can.
      guard let uri = record["uri"] as? String, let url = URL(string: uri), url.isFileURL else {
        return nil
      }
      return .file(url)
    case "upstream":
      guard
        let raw = record["url"] as? String, let url = URL(string: raw),
        url.scheme == "http" || url.scheme == "https"
      else { return nil }
      let headers = (record["headers"] as? [String: Any])?.compactMapValues { $0 as? String } ?? [:]
      return .upstream(url, headers)
    default:
      return nil
    }
  }

  // MARK: - Addresses

  /// A receiver's address as JS hands it over; literals only, never a DNS lookup.
  private static func literal(_ raw: String) -> String? {
    var host = raw.trimmingCharacters(in: .whitespaces)
    if let slash = host.lastIndex(of: "/") { host = String(host[host.index(after: slash)...]) }
    if host.filter({ $0 == ":" }).count == 1 { host = String(host.split(separator: ":")[0]) }
    var probe = in_addr()
    return inet_pton(AF_INET, host, &probe) == 1 ? host : nil
  }

  /**
   This phone's IPv4 address on the route to `receiver`, when that route leaves
   through a Wi-Fi or Ethernet interface (`en*`); otherwise the first such address.
   Never a cellular (`pdp_ip*`) or VPN (`utun*`) one: a receiver can't reach those,
   and the cellular one may be routable from the internet.
   */
  private static func localAddress(toward receiver: String?) -> String? {
    let local = localNetworkAddresses()
    if let receiver, let routed = routedSource(to: receiver), local.contains(routed) {
      return routed
    }
    return local.first
  }

  private static func localNetworkAddresses() -> [String] {
    var list: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&list) == 0, let first = list else { return [] }
    defer { freeifaddrs(list) }
    var addresses: [String] = []
    var cursor: UnsafeMutablePointer<ifaddrs>? = first
    while let entry = cursor {
      defer { cursor = entry.pointee.ifa_next }
      guard
        let raw = entry.pointee.ifa_addr, raw.pointee.sa_family == sa_family_t(AF_INET),
        String(cString: entry.pointee.ifa_name).hasPrefix("en"),
        (entry.pointee.ifa_flags & UInt32(IFF_UP)) != 0
      else { continue }
      let address = raw.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr }
      addresses.append(string(address))
    }
    return addresses
  }

  /// Connecting a UDP socket sends nothing; it asks the kernel which source it would use.
  private static func routedSource(to host: String) -> String? {
    let fd = socket(AF_INET, SOCK_DGRAM, 0)
    guard fd >= 0 else { return nil }
    defer { close(fd) }
    var target = sockaddr_in()
    target.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    target.sin_family = sa_family_t(AF_INET)
    target.sin_port = UInt16(9).bigEndian
    guard inet_pton(AF_INET, host, &target.sin_addr) == 1 else { return nil }
    let connected = withUnsafePointer(to: &target) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    guard connected == 0 else { return nil }
    var local = sockaddr_in()
    var length = socklen_t(MemoryLayout<sockaddr_in>.size)
    let named = withUnsafeMutablePointer(to: &local) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        getsockname(fd, $0, &length)
      }
    }
    return named == 0 ? string(local.sin_addr) : nil
  }

  private static func string(_ address: in_addr) -> String {
    var copy = address
    var buffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
    inet_ntop(AF_INET, &copy, &buffer, socklen_t(INET_ADDRSTRLEN))
    return String(cString: buffer)
  }

  // MARK: - Wire

  fileprivate static func readHead(_ fd: Int32) -> [String]? {
    var accumulated = Data()
    var buffer = [UInt8](repeating: 0, count: 1024)
    while accumulated.count < headLimit {
      let read = recv(fd, &buffer, buffer.count, 0)
      if read <= 0 { return nil }
      accumulated.append(contentsOf: buffer[0..<read])
      guard let terminator = accumulated.range(of: Data("\r\n\r\n".utf8)) else { continue }
      let head = accumulated.subdata(in: accumulated.startIndex..<terminator.lowerBound)
      guard let text = String(data: head, encoding: .isoLatin1) else { return nil }
      return text.components(separatedBy: "\r\n").filter { !$0.isEmpty }
    }
    return nil
  }

  fileprivate static func header(_ head: [String], _ name: String) -> String? {
    for line in head.dropFirst() {
      guard let colon = line.firstIndex(of: ":") else { continue }
      if line[line.startIndex..<colon].trimmingCharacters(in: .whitespaces).lowercased() == name {
        return line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
      }
    }
    return nil
  }

  /// Same rules as SmbBridge.swift's: half-open, nil when unsatisfiable.
  fileprivate static func parseRange(_ value: String?, size: UInt64) -> Range<UInt64>? {
    if size == 0 { return value == nil ? 0..<0 : nil }
    guard let value else { return 0..<size }
    guard let equals = value.firstIndex(of: "=") else { return nil }
    let spec = value[value.index(after: equals)...]
      .components(separatedBy: ",")[0]
      .trimmingCharacters(in: .whitespaces)
    guard let dash = spec.firstIndex(of: "-") else { return nil }
    let startText = spec[spec.startIndex..<dash].trimmingCharacters(in: .whitespaces)
    let endText = spec[spec.index(after: dash)...].trimmingCharacters(in: .whitespaces)
    if startText.isEmpty {
      guard let suffix = UInt64(endText), suffix > 0 else { return nil }
      return (size > suffix ? size - suffix : 0)..<size
    }
    guard let start = UInt64(startText), start < size else { return nil }
    let end: UInt64
    if endText.isEmpty {
      end = size - 1
    } else {
      guard let parsed = UInt64(endText) else { return nil }
      end = min(parsed, size - 1)
    }
    guard end >= start else { return nil }
    return start..<(end + 1)
  }

  /// DLNA headers last: at least one Samsung TV only reads contentFeatures there.
  fileprivate static func respond(
    _ fd: Int32,
    _ code: Int,
    _ reason: String,
    headers: [(String, String)] = [],
    contentLength: Int64? = 0,
    dlna: (String, String)? = nil
  ) {
    var response = "HTTP/1.1 \(code) \(reason)\r\n"
    for (name, value) in headers { response += "\(name): \(value)\r\n" }
    if let contentLength { response += "Content-Length: \(contentLength)\r\n" }
    response += "Connection: close\r\n"
    if let dlna {
      response += "transferMode.dlna.org: \(dlna.0)\r\n"
      response += "contentFeatures.dlna.org: \(dlna.1)\r\n"
    }
    response += "\r\n"
    _ = writeAll(fd, Data(response.utf8))
  }

  @discardableResult
  fileprivate static func writeAll(_ fd: Int32, _ data: Data) -> Bool {
    var offset = 0
    while offset < data.count {
      let sent = data.withUnsafeBytes { raw -> Int in
        guard let base = raw.baseAddress else { return -1 }
        return send(fd, base.advanced(by: offset), data.count - offset, 0)
      }
      if sent <= 0 { return false }
      offset += sent
    }
    return true
  }

  private static func setTimeouts(_ fd: Int32, seconds: Int) {
    var timeout = timeval(tv_sec: seconds, tv_usec: 0)
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
  }
}

/**
 One upstream fetch relayed to one receiver connection, written to the socket as it
 arrives. Runs on the request's worker thread, which blocks until the transfer ends.
 */
private final class UpstreamRelay: NSObject, URLSessionDataDelegate, @unchecked Sendable {
  private let fd: Int32
  private let method: String
  private let mime: String
  private let dlna: (String, String)
  private let finished = DispatchSemaphore(value: 0)
  private var status = 0
  private var bytes: Int64 = 0
  private var answered = false

  init(fd: Int32, method: String, mime: String, dlna: (String, String)) {
    self.fd = fd
    self.method = method
    self.mime = mime
    self.dlna = dlna
  }

  func run(url: URL, headers: [String: String], range: String?) -> (status: Int, bytes: Int64) {
    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
    request.httpMethod = method
    for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
    // Inflating a gzip body would drop Content-Length and break every range after.
    request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
    if let range { request.setValue(range, forHTTPHeaderField: "Range") }
    let session = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: nil)
    session.dataTask(with: request).resume()
    finished.wait()
    session.finishTasksAndInvalidate()
    return (status, bytes)
  }

  func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    answered = true
    guard let http = response as? HTTPURLResponse else {
      fail(502, "Bad Gateway")
      completionHandler(.cancel)
      return
    }
    let code = http.statusCode
    switch code {
    case 200, 206:
      var headers: [(String, String)] = [("Content-Type", mime)]
      if let ranges = http.value(forHTTPHeaderField: "Accept-Ranges") ?? (code == 206 ? "bytes" : nil) {
        headers.append(("Accept-Ranges", ranges))
      }
      if code == 206, let contentRange = http.value(forHTTPHeaderField: "Content-Range") {
        headers.append(("Content-Range", contentRange))
      }
      let length = http.value(forHTTPHeaderField: "Content-Length").flatMap { Int64($0) }
      CastServer.respond(
        fd, code, code == 206 ? "Partial Content" : "OK", headers: headers,
        contentLength: length, dlna: dlna)
      status = code
      completionHandler(method == "GET" ? .allow : .cancel)
    case 416:
      var headers: [(String, String)] = []
      if let contentRange = http.value(forHTTPHeaderField: "Content-Range") {
        headers.append(("Content-Range", contentRange))
      }
      CastServer.respond(fd, 416, "Range Not Satisfiable", headers: headers)
      status = 416
      completionHandler(.cancel)
    case 404, 410:
      fail(404, "Not Found")
      completionHandler(.cancel)
    default:
      fail(502, "Bad Gateway")
      completionHandler(.cancel)
    }
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    if CastServer.writeAll(fd, data) {
      bytes += Int64(data.count)
    } else {
      dataTask.cancel()
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if !answered { fail(502, "Bad Gateway") }
    finished.signal()
  }

  private func fail(_ code: Int, _ reason: String) {
    CastServer.respond(fd, code, reason)
    status = code
  }
}
