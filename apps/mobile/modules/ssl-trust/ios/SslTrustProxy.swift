import Foundation
import Network
import Security

/// Loopback reverse proxy that fronts trusted self-signed hosts for AVPlayer
/// (expo-audio), which ignores `URLProtocol` and so can't be covered by
/// `SslTrustURLProtocol`. The JS side rewrites a stream URL to
/// `http://127.0.0.1:<port>/<token>/<original-path>` (see `resolveServerBase`);
/// this proxy maps `<token>` back to the upstream base, opens a TLS connection
/// that accepts the trusted certificate, and pipes bytes both ways.
///
/// NOTE: wired but not yet verified on-device. The progressive `/rest/stream`
/// path (Navidrome default) is the target; HLS playlists would additionally
/// need in-body segment-URL rewriting, which is a documented follow-up.
final class SslTrustProxy {
  static let shared = SslTrustProxy()

  struct Upstream {
    let baseUrl: String
    let token: String
    let host: String
    let port: UInt16
  }

  private let queue = DispatchQueue(label: "app.wavio.ssltrust.proxy")
  private var listener: NWListener?
  private var upstreams: [String: Upstream] = [:]  // token -> upstream
  private(set) var port: UInt16 = 0

  private init() {}

  /// Register the trusted subset of `baseUrls`, (re)starting or stopping the
  /// listener as needed. Returns the active proxy info, or nil when nothing is
  /// trusted.
  func sync(baseUrls: [String]) -> [String: Any]? {
    return queue.sync {
      var map: [String: Upstream] = [:]
      for base in baseUrls {
        guard let url = URL(string: base), let host = url.host,
          SslTrustStore.shared.isTrusted(host: host)
        else { continue }
        let scheme = url.scheme?.lowercased() ?? "https"
        guard scheme == "https" else { continue }
        let port = UInt16(url.port ?? 443)
        let token = Self.token(for: base)
        map[token] = Upstream(
          baseUrl: normalized(base), token: token, host: host, port: port)
      }
      upstreams = map

      if map.isEmpty {
        stopLocked()
        return nil
      }
      if listener == nil { startLocked() }
      return infoLocked()
    }
  }

  func info() -> [String: Any]? {
    queue.sync { listener != nil ? infoLocked() : nil }
  }

  // MARK: listener lifecycle (queue-isolated)

  private func startLocked() {
    do {
      let params = NWParameters.tcp
      params.requiredInterfaceType = .loopback
      let listener = try NWListener(using: params, on: .any)
      listener.newConnectionHandler = { [weak self] conn in
        self?.handle(conn)
      }
      listener.stateUpdateHandler = { [weak self] state in
        if case .ready = state, let p = listener.port?.rawValue {
          self?.port = p
        }
      }
      listener.start(queue: queue)
      self.listener = listener
    } catch {
      NSLog("[ssl-trust] proxy listener failed: \(error)")
    }
  }

  private func stopLocked() {
    listener?.cancel()
    listener = nil
    port = 0
  }

  private func infoLocked() -> [String: Any] {
    [
      "port": Int(port),
      "upstreams": upstreams.values.map {
        ["baseUrl": $0.baseUrl, "token": $0.token]
      },
    ]
  }

  // MARK: request handling

  private func handle(_ conn: NWConnection) {
    conn.start(queue: queue)
    receiveHead(conn, buffer: Data())
  }

  /// Read until end-of-headers, parse the request line for the token, then
  /// open the upstream and forward.
  private func receiveHead(_ conn: NWConnection, buffer: Data) {
    conn.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) {
      [weak self] data, _, isComplete, error in
      guard let self = self else { return }
      var buffer = buffer
      if let data = data { buffer.append(data) }

      if let range = buffer.range(of: Data("\r\n\r\n".utf8)) {
        let head = buffer.subdata(in: buffer.startIndex..<range.upperBound)
        let body = buffer.subdata(in: range.upperBound..<buffer.endIndex)
        self.forward(client: conn, head: head, leftoverBody: body)
        return
      }
      if isComplete || error != nil || buffer.count > 64 * 1024 {
        conn.cancel()
        return
      }
      self.receiveHead(conn, buffer: buffer)
    }
  }

  private func forward(client: NWConnection, head: Data, leftoverBody: Data) {
    guard let headString = String(data: head, encoding: .utf8),
      let (rewritten, upstream) = rewrite(head: headString)
    else {
      client.cancel()
      return
    }

    let upstreamConn = NWConnection(
      host: NWEndpoint.Host(upstream.host),
      port: NWEndpoint.Port(rawValue: upstream.port)!,
      using: tlsParameters(for: upstream.host))
    upstreamConn.start(queue: queue)

    var outbound = Data(rewritten.utf8)
    outbound.append(leftoverBody)
    upstreamConn.send(
      content: outbound,
      completion: .contentProcessed { _ in
        // Pipe both directions until either side closes.
        self.pipe(from: upstreamConn, to: client)
        self.pipe(from: client, to: upstreamConn)
      })
  }

  /// Rewrite `GET /<token>/<path> HTTP/1.1` + `Host:` for the upstream.
  private func rewrite(head: String) -> (String, Upstream)? {
    var lines = head.components(separatedBy: "\r\n")
    guard let first = lines.first else { return nil }
    let parts = first.components(separatedBy: " ")
    guard parts.count >= 3 else { return nil }

    var path = parts[1]
    if path.hasPrefix("/") { path.removeFirst() }
    let slash = path.firstIndex(of: "/") ?? path.endIndex
    let token = String(path[path.startIndex..<slash])
    guard let upstream = upstreams[token] else { return nil }
    let rest = slash == path.endIndex ? "" : String(path[path.index(after: slash)...])

    lines[0] = "\(parts[0]) /\(rest) \(parts[2])"
    lines = lines.map { line in
      line.lowercased().hasPrefix("host:") ? "Host: \(upstream.host)" : line
    }
    return (lines.joined(separator: "\r\n"), upstream)
  }

  private func pipe(from: NWConnection, to: NWConnection) {
    from.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
      data, _, isComplete, error in
      if let data = data, !data.isEmpty {
        to.send(content: data, completion: .contentProcessed { _ in })
      }
      if isComplete || error != nil {
        to.send(content: nil, completion: .contentProcessed { _ in })
        return
      }
      self.pipe(from: from, to: to)
    }
  }

  /// TLS that accepts the trusted certificate for `host` via the verify block.
  private func tlsParameters(for host: String) -> NWParameters {
    let tls = NWProtocolTLS.Options()
    sec_protocol_options_set_verify_block(
      tls.securityProtocolOptions,
      { _, secTrustRef, complete in
        let trust = sec_trust_copy_ref(secTrustRef).takeRetainedValue()
        let leaf: SecCertificate? = {
          if #available(iOS 15.0, *) {
            return (SecTrustCopyCertificateChain(trust) as? [SecCertificate])?
              .first
          } else {
            return SecTrustGetCertificateAtIndex(trust, 0)
          }
        }()
        let ok =
          SslTrustStore.shared.isTrusted(host: host)
          && leaf.map {
            SslTrustStore.shared.isFingerprintTrusted(
              SslTrustStore.fingerprint(for: $0))
          } ?? false
        complete(ok)
      },
      queue)
    return NWParameters(tls: tls)
  }

  // MARK: helpers

  private func normalized(_ url: String) -> String {
    var s = url.trimmingCharacters(in: .whitespaces)
    while s.hasSuffix("/") { s.removeLast() }
    return s
  }

  private static func token(for base: String) -> String {
    // Stable, opaque token per upstream so URLs don't leak the real host.
    var hasher = Hasher()
    hasher.combine(base)
    return String(format: "%016x", UInt64(bitPattern: Int64(hasher.finalize())))
  }
}
