import CommonCrypto
import ExpoModulesCore
import Foundation
import Security

/**
 Loopback HTTP server that fronts an SMB share.

 Neither AVPlayer nor `AVURLAsset` speaks SMB, and `expo-audio` exposes no custom
 data-source hook, so the only way to play a file off a share is to make it look
 like an HTTP resource. Everything downstream — the player, the native metadata
 reader, the offline downloader, the waveform analyser, and the JS raw-tag reader —
 then needs no SMB-specific code at all.

 Port of SmbBridge.kt, whose response rules this has to match exactly. The other
 in-repo precedent, modules/ssl-trust/ios/SslTrustProxy.swift, contributes only the
 idea: it is a byte pipe between two HTTP peers and authors no responses, so it has
 no `Range` handling, no timeouts and no worker ceiling.

 Raw sockets rather than `NWListener` because `bridgeUrl` is synchronous by
 contract (services/fileSource/types.ts) and may be the first thing a cold start
 calls. `NWListener.port` only becomes readable once its `.ready` handler runs,
 which is why the ssl-trust proxy reports port 0 on its first call; `bind` +
 `getsockname` are synchronous and have no such gap.
 */
final class SmbBridge: @unchecked Sendable {
  static let shared = SmbBridge()

  private static let backlog: Int32 = 16

  // One thread per in-flight request, and a playing track holds its thread for the
  // whole track. A scan adds `extractConcurrency` metadata reads plus their ranged
  // tag reads, so the ceiling sits well above that — but it *is* a ceiling:
  // anything on the device can open a loopback socket, and an unbounded pool would
  // let one spawn threads without limit. Over it, the accept loop closes the
  // connection rather than queueing it behind a track that plays for four minutes.
  private static let maxWorkers = 32

  // A request head this large is not one of ours.
  private static let headLimit = 16 * 1024

  private static let chunk = 64 * 1024

  // Short while reading the request head, so a client that connects and says
  // nothing can't hold a worker; raised for the body, where an SMB read can
  // legitimately stall on a NAS waking from sleep.
  private static let headTimeoutSeconds = 5
  private static let bodyTimeoutSeconds = 30

  private static let fallbackTimeoutMs = 20_000

  private let lock = NSLock()
  private var listenFD: Int32 = -1
  private var port: UInt16 = 0
  private var targets: [String: SmbEndpoint] = [:]
  private var timeouts: [String: Int] = [:]

  private let gate = DispatchSemaphore(value: SmbBridge.maxWorkers)

  // Mixed into every token so it can't be derived from the share's address by
  // another app on the device — unlike ssl-trust's, this token is what stops
  // anything else on the phone reading the user's files.
  private let salt: Data = {
    var bytes = [UInt8](repeating: 0, count: 16)
    if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
      for index in bytes.indices { bytes[index] = UInt8.random(in: .min ... .max) }
    }
    return Data(bytes)
  }()

  // MARK: - Public surface

  /**
   URL an HTTP consumer on this device can open for `path`.

   Starts the listener if it isn't running, so this stays correct when called as the
   very first thing after a cold start. Binding a loopback socket doesn't touch the
   network.
   */
  func urlFor(_ target: SmbEndpoint, path: String, timeoutMs: Int) throws -> String {
    let token = tokenFor(target)
    let port = try ensureListening()
    lock.lock()
    targets[token] = target
    timeouts[token] = timeoutMs
    lock.unlock()
    let absolute = path.hasPrefix("/") ? path : "/\(path)"
    let encoded =
      absolute.addingPercentEncoding(withAllowedCharacters: SmbBridge.pathAllowed) ?? absolute
    return "http://127.0.0.1:\(port)/\(token)\(encoded)"
  }

  func stop() {
    lock.lock()
    let fd = listenFD
    listenFD = -1
    port = 0
    targets.removeAll()
    timeouts.removeAll()
    lock.unlock()
    if fd >= 0 { close(fd) }
  }

  // MARK: - Listener

  private func ensureListening() throws -> UInt16 {
    lock.lock()
    if listenFD >= 0 {
      let existing = port
      lock.unlock()
      return existing
    }
    lock.unlock()

    let fd = socket(AF_INET, SOCK_STREAM, 0)
    guard fd >= 0 else {
      throw SmbUnreachableException("Could not open the SMB bridge socket (errno \(errno))")
    }
    var reuse: Int32 = 1
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))

    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = 0
    // Loopback only. Binding the LAN interface would expose the user's whole share
    // to the network, which is a casting concern and not this.
    address.sin_addr = in_addr(s_addr: UInt32(0x7f00_0001).bigEndian)

    let bound = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    guard bound == 0, listen(fd, SmbBridge.backlog) == 0 else {
      let failure = errno
      close(fd)
      throw SmbUnreachableException("Could not bind the SMB bridge (errno \(failure))")
    }

    var assigned = sockaddr_in()
    var length = socklen_t(MemoryLayout<sockaddr_in>.size)
    withUnsafeMutablePointer(to: &assigned) { pointer in
      _ = pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        getsockname(fd, $0, &length)
      }
    }
    let assignedPort = UInt16(bigEndian: assigned.sin_port)

    lock.lock()
    // Another caller won the race while we were binding.
    if listenFD >= 0 {
      let existing = port
      lock.unlock()
      close(fd)
      return existing
    }
    listenFD = fd
    port = assignedPort
    lock.unlock()

    let accepter = Thread { [weak self] in self?.acceptLoop(fd) }
    accepter.name = "wavio-smb-accept"
    accepter.start()
    return assignedPort
  }

  private func acceptLoop(_ fd: Int32) {
    while true {
      let client = accept(fd, nil, nil)
      if client < 0 {
        if errno == EINTR { continue }
        // Closed by stop(), or the listener died; either way this loop is over and
        // the next urlFor() re-binds.
        break
      }
      if gate.wait(timeout: .now()) == .timedOut {
        close(client)
        continue
      }
      let worker = Thread { [weak self] in
        defer { self?.gate.signal() }
        self?.serve(client)
      }
      worker.name = "wavio-smb-bridge"
      worker.start()
    }
    // Only close what we still own: stop() may already have closed this
    // descriptor, and closing it twice would take out whatever the OS handed the
    // number to in between.
    lock.lock()
    let owned = listenFD == fd
    if owned {
      listenFD = -1
      port = 0
    }
    lock.unlock()
    if owned { close(fd) }
  }

  // MARK: - Connection

  private func serve(_ fd: Int32) {
    defer { close(fd) }
    var enable: Int32 = 1
    // Without this a client that hangs up mid-body raises SIGPIPE and takes the
    // whole app down — AVPlayer abandons its connection on every seek.
    setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &enable, socklen_t(MemoryLayout<Int32>.size))
    setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &enable, socklen_t(MemoryLayout<Int32>.size))
    setTimeouts(fd, seconds: SmbBridge.headTimeoutSeconds)

    guard let head = readHead(fd) else { return }
    setTimeouts(fd, seconds: SmbBridge.bodyTimeoutSeconds)
    handle(head, fd)
  }

  private func handle(_ head: [String], _ fd: Int32) {
    let request = (head.first ?? "").split(separator: " ", omittingEmptySubsequences: false)
    guard request.count >= 3 else {
      respond(fd, 400, "Bad Request")
      return
    }
    let method = request[0].uppercased()
    guard method == "GET" || method == "HEAD" else {
      respond(fd, 405, "Method Not Allowed")
      return
    }
    guard let (token, path) = splitTarget(String(request[1])) else {
      respond(fd, 400, "Bad Request")
      return
    }
    // 404 rather than 403: a wrong token shouldn't confirm that the bridge is
    // serving anything at all.
    guard let (target, timeoutMs) = lookup(token) else {
      respond(fd, 404, "Not Found")
      return
    }

    let file: SmbOpenFile
    do {
      file = try runBlocking {
        try await SmbStore.shared.open(target, path: path, timeoutMs: timeoutMs)
      }
    } catch is SmbPathException {
      respond(fd, 404, "Not Found")
      return
    } catch {
      respond(fd, 502, "Bad Gateway")
      return
    }
    defer {
      _ = try? runBlocking { await SmbStore.shared.close(handle: file.handle) }
    }

    let requested = header(head, "range")
    guard let range = parseRange(requested, size: file.size) else {
      // Explicitly unsatisfiable, per RFC 9110 — a player that asked past the end
      // needs the real length back, not a truncated body.
      respond(
        fd, 416, "Range Not Satisfiable",
        headers: [("Content-Range", "bytes */\(file.size)"), ("Content-Length", "0")])
      return
    }

    let length = range.upperBound - range.lowerBound
    let partial = requested != nil
    var headers: [(String, String)] = [
      ("Content-Type", SmbBridge.contentType(path)),
      ("Content-Length", String(length)),
      ("Accept-Ranges", "bytes"),
    ]
    if partial {
      headers.append(
        ("Content-Range", "bytes \(range.lowerBound)-\(range.upperBound - 1)/\(file.size)"))
    }
    respond(
      fd,
      partial ? 206 : 200,
      partial ? "Partial Content" : "OK",
      headers: headers)

    if method == "GET" {
      stream(fd, handle: file.handle, start: range.lowerBound, length: length, timeoutMs: timeoutMs)
    }
  }

  private func stream(_ fd: Int32, handle: Int, start: UInt64, length: UInt64, timeoutMs: Int) {
    var offset = start
    var remaining = length
    while remaining > 0 {
      let want = UInt32(min(UInt64(SmbBridge.chunk), remaining))
      // Bound outside the closure: `offset` is a var, and capturing it in a
      // `@Sendable` closure is an error under the Swift 6 language mode.
      let position = offset
      let data: Data
      do {
        data = try runBlocking {
          try await SmbStore.shared.read(
            handle: handle, offset: position, length: want, timeoutMs: timeoutMs)
        }
      } catch {
        // The status line is already out, so there is nothing to report but the
        // truncated body. The next request heals the session.
        return
      }
      if data.isEmpty { return }
      if !writeAll(fd, data) { return }
      offset += UInt64(data.count)
      remaining -= UInt64(data.count)
    }
  }

  // MARK: - Request parsing

  /// Request line + headers, or nil when the head never terminated.
  private func readHead(_ fd: Int32) -> [String]? {
    var accumulated = Data()
    var buffer = [UInt8](repeating: 0, count: 1024)
    while accumulated.count < SmbBridge.headLimit {
      let read = recv(fd, &buffer, buffer.count, 0)
      if read <= 0 { return nil }
      accumulated.append(contentsOf: buffer[0..<read])
      guard let terminator = accumulated.range(of: Data("\r\n\r\n".utf8)) else { continue }
      let head = accumulated.subdata(in: accumulated.startIndex..<terminator.lowerBound)
      // Latin-1 by construction: paths reach us percent-encoded, so the head is
      // pure ASCII.
      guard let text = String(data: head, encoding: .isoLatin1) else { return nil }
      return
        text
        .components(separatedBy: "\r\n")
        .flatMap { $0.components(separatedBy: "\n") }
        .filter { !$0.isEmpty }
    }
    return nil
  }

  private func splitTarget(_ requestTarget: String) -> (String, String)? {
    var trimmed = requestTarget.components(separatedBy: "?")[0]
    if trimmed.hasPrefix("/") { trimmed.removeFirst() }
    guard let separator = trimmed.firstIndex(of: "/"), separator != trimmed.startIndex else {
      return nil
    }
    let token = String(trimmed[trimmed.startIndex..<separator])
    let encoded = String(trimmed[separator...])
    guard let path = encoded.removingPercentEncoding, !path.isEmpty else { return nil }
    return (token, path)
  }

  private func header(_ head: [String], _ name: String) -> String? {
    for line in head.dropFirst() {
      guard let colon = line.firstIndex(of: ":") else { continue }
      if line[line.startIndex..<colon].trimmingCharacters(in: .whitespaces).lowercased() == name {
        return line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
      }
    }
    return nil
  }

  /**
   `bytes=a-b`, `bytes=a-` and `bytes=-n`, resolved against `size`, as a half-open
   range. Nil means unsatisfiable; no header at all means the whole file.
   */
  private func parseRange(_ value: String?, size: UInt64) -> Range<UInt64>? {
    // An empty file has no satisfiable range, but is a perfectly good 200 with no
    // body.
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

  // MARK: - Response

  private func respond(
    _ fd: Int32,
    _ code: Int,
    _ reason: String,
    headers: [(String, String)] = []
  ) {
    var response = "HTTP/1.1 \(code) \(reason)\r\n"
    for (name, value) in headers {
      response += "\(name): \(value)\r\n"
    }
    if !headers.contains(where: { $0.0 == "Content-Length" }) {
      response += "Content-Length: 0\r\n"
    }
    // No keep-alive: one request per connection is all AVPlayer and the metadata
    // reader need, and it removes every way to get connection reuse wrong.
    response += "Connection: close\r\n\r\n"
    _ = writeAll(fd, Data(response.utf8))
  }

  @discardableResult
  private func writeAll(_ fd: Int32, _ data: Data) -> Bool {
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

  private func setTimeouts(_ fd: Int32, seconds: Int) {
    var timeout = timeval(tv_sec: seconds, tv_usec: 0)
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
  }

  // MARK: - Tokens

  /// Stable per (process, share) so `urlFor` is idempotent and the map is bounded.
  private func tokenFor(_ target: SmbEndpoint) -> String {
    var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    var context = CC_SHA256_CTX()
    CC_SHA256_Init(&context)
    salt.withUnsafeBytes { _ = CC_SHA256_Update(&context, $0.baseAddress, CC_LONG(salt.count)) }
    let key = Data(target.key.utf8)
    key.withUnsafeBytes { _ = CC_SHA256_Update(&context, $0.baseAddress, CC_LONG(key.count)) }
    CC_SHA256_Final(&digest, &context)
    return digest.prefix(16).map { String(format: "%02x", $0) }.joined()
  }

  private func lookup(_ token: String) -> (SmbEndpoint, Int)? {
    lock.lock()
    defer { lock.unlock() }
    // Constant-time over the registered tokens, so a wrong guess leaks nothing
    // about how much of it was right.
    var found: (SmbEndpoint, Int)?
    for (known, target) in targets where SmbBridge.constantTimeEqual(known, token) {
      found = (target, timeouts[known] ?? SmbBridge.fallbackTimeoutMs)
    }
    return found
  }

  private static func constantTimeEqual(_ lhs: String, _ rhs: String) -> Bool {
    let left = Array(lhs.utf8)
    let right = Array(rhs.utf8)
    if left.count != right.count { return false }
    var difference: UInt8 = 0
    for index in left.indices {
      difference |= left[index] ^ right[index]
    }
    return difference == 0
  }

  // MARK: - Helpers

  private static let pathAllowed: CharacterSet = {
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-._~/")
    return allowed
  }()

  // AVURLAsset picks its demuxer partly from Content-Type for an HTTP source, so a
  // wrong or missing one shows up as a file that plays locally but not off the
  // share. Keys match AUDIO_EXTENSIONS in services/local/indexer.ts.
  private static func contentType(_ path: String) -> String {
    switch (path as NSString).pathExtension.lowercased() {
    case "mp3": return "audio/mpeg"
    case "flac": return "audio/flac"
    case "m4a", "alac": return "audio/mp4"
    case "aac": return "audio/aac"
    case "ogg", "oga": return "audio/ogg"
    case "opus": return "audio/opus"
    case "wav": return "audio/wav"
    case "wma": return "audio/x-ms-wma"
    case "aiff", "aif": return "audio/aiff"
    default: return "application/octet-stream"
    }
  }

  /**
   Runs an actor call from a bridge worker thread.

   These are plain `Thread`s, not cooperative-pool threads, so blocking one is safe
   — and the worker ceiling is what bounds how many can be blocked at once.
   */
  private func runBlocking<T: Sendable>(_ body: @escaping @Sendable () async throws -> T) throws -> T
  {
    let box = ResultBox<T>()
    let semaphore = DispatchSemaphore(value: 0)
    Task {
      do {
        box.result = .success(try await body())
      } catch {
        box.result = .failure(error)
      }
      semaphore.signal()
    }
    semaphore.wait()
    switch box.result {
    case .success(let value): return value
    case .failure(let error): throw error
    case nil: throw SmbUnreachableException("SMB bridge lost its result")
    }
  }
}

private final class ResultBox<T>: @unchecked Sendable {
  var result: Result<T, Error>?
}
