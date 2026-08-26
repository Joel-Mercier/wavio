import ExpoModulesCore
import Foundation

// The vendored client is a plain class tree with no isolation of its own. Every
// access below goes through this actor, which is what makes that safe — in
// particular `Session.messageId` is a non-atomic counter mutated just before each
// send, so two genuinely parallel callers would emit duplicate SMB2 message ids.
extension SMBClient: @unchecked Sendable {}
extension FileReader: @unchecked Sendable {}

/// An open file, as the bridge sees it.
struct SmbOpenFile: Sendable {
  let handle: Int
  let size: UInt64
}

/**
 One cached SMB session, shared by every caller. Port of SmbConnection.kt.

 A share is expensive to set up (TCP connect, dialect negotiation, NTLM) and cheap
 to keep, and a scan plus playback will hit it from several threads at once. The
 actor serializes the synchronous part of each operation; the client's own
 connection semaphore serializes the wire. Because an actor is reentrant at every
 `await`, a streaming response interleaves with directory listings at *message*
 granularity rather than holding the session for a whole track — which is why the
 bridge reads in chunks.
 */
actor SmbStore {
  static let shared = SmbStore()

  private var key: String?
  private var client: SMBClient?

  private var readers: [Int: (client: SMBClient, reader: FileReader)] = [:]
  private var nextHandle = 1

  // MARK: - Operations

  func list(_ target: SmbEndpoint, path: String, timeoutMs: Int) async throws -> [[String: Any]] {
    try await run(target, timeoutMs) { client in
      try await client.listDirectory(path: path).compactMap { file -> [String: Any]? in
        if file.name == "." || file.name == ".." { return nil }
        return [
          "name": file.name,
          "isDirectory": file.isDirectory,
          // The indexer's incremental skip keys on (uri, size, mtime), and both
          // come back with the listing — so a re-scan costs one round trip per
          // directory and nothing per file.
          "size": file.isDirectory ? 0.0 : Double(file.size),
          "mtime": file.lastWriteTime.timeIntervalSince1970 * 1000,
        ]
      }
    }
  }

  func exists(_ target: SmbEndpoint, path: String, timeoutMs: Int) async throws -> Bool {
    try await run(target, timeoutMs) { client in
      if try await client.existDirectory(path: path) { return true }
      return try await client.existFile(path: path)
    }
  }

  /// Reachability and credential check in one: `run` connects, authenticates and
  /// attaches to the share before the block ever executes.
  func probe(_ target: SmbEndpoint, timeoutMs: Int) async throws -> Bool {
    try await run(target, timeoutMs) { client in
      try await client.existDirectory(path: "/")
    }
  }

  /**
   Opens a file for reading and keeps the handle. It outlives the call because the
   bridge streams a response body from it — a mid-stream failure can't be retried
   anyway (the HTTP status is already sent), so the bridge just closes the socket
   and the caller's next request heals the connection through the retry in `run`.
   */
  func open(_ target: SmbEndpoint, path: String, timeoutMs: Int) async throws -> SmbOpenFile {
    try await run(target, timeoutMs) { client in
      let reader = client.fileReader(path: path)
      // Resolves the create, so a missing file fails here rather than mid-body.
      let size = try await reader.fileSize
      let handle = self.nextHandle
      self.nextHandle += 1
      self.readers[handle] = (client, reader)
      return SmbOpenFile(handle: handle, size: size)
    }
  }

  func read(handle: Int, offset: UInt64, length: UInt32, timeoutMs: Int) async throws -> Data {
    guard let entry = readers[handle] else {
      throw SmbPathException("SMB file handle \(handle) is gone")
    }
    return try await withWatchdog(entry.client, timeoutMs) {
      try await entry.reader.read(offset: offset, length: length)
    }
  }

  func close(handle: Int) async {
    guard let entry = readers.removeValue(forKey: handle) else { return }
    try? await entry.reader.close()
  }

  func reset() {
    drop()
  }

  // MARK: - Session

  /**
   Runs `body` against the target's share, reconnecting once if the cached
   connection turns out to be dead.

   A protocol-level answer (`ErrorResponse`) is *not* retried: the server replied,
   so the connection is fine and the answer won't change. Anything else is the
   transport, which a NAS drops freely — after a sleep, a Wi-Fi roam, or its own
   idle timeout — and that is worth exactly one more attempt.
   */
  private func run<T>(
    _ target: SmbEndpoint,
    _ timeoutMs: Int,
    _ body: (SMBClient) async throws -> T
  ) async throws -> T {
    do {
      let client = try await clientFor(target, timeoutMs)
      return try await withWatchdog(client, timeoutMs) { try await body(client) }
    } catch let failure as SmbFailure {
      throw failure
    } catch let error as ErrorResponse {
      throw translate(error)
    } catch {
      drop()
    }
    do {
      let client = try await clientFor(target, timeoutMs)
      return try await withWatchdog(client, timeoutMs) { try await body(client) }
    } catch let failure as SmbFailure {
      throw failure
    } catch let error as ErrorResponse {
      throw translate(error)
    } catch {
      drop()
      throw SmbUnreachableException(describe(target, error))
    }
  }

  private func clientFor(_ target: SmbEndpoint, _ timeoutMs: Int) async throws -> SMBClient {
    if let client, key == target.key {
      return client
    }
    drop()
    return try await connect(target, timeoutMs)
  }

  private func connect(_ target: SmbEndpoint, _ timeoutMs: Int) async throws -> SMBClient {
    let client = SMBClient(host: target.host, port: target.port)
    do {
      try await withWatchdog(client, timeoutMs) {
        _ = try await client.login(
          username: target.username,
          password: target.password,
          domain: target.domain.isEmpty ? nil : target.domain
        )
        _ = try await client.connectShare(target.share)
      }
    } catch let failure as SmbFailure {
      client.session.disconnect()
      throw failure
    } catch let error as ErrorResponse {
      client.session.disconnect()
      throw translate(error)
    } catch {
      client.session.disconnect()
      throw SmbUnreachableException(describe(target, error))
    }
    self.client = client
    key = target.key
    return client
  }

  private func drop() {
    readers.removeAll()
    client?.session.disconnect()
    client = nil
    key = nil
  }

  /**
   The vendored client has no timeout of its own — nothing corresponds to smbj's
   `SmbConfig.withTimeout`. Cancelling the awaiting task wouldn't help either,
   because the pending `NWConnection` continuation isn't cancellable; the only thing
   that resumes it is tearing the connection down. So a detached watchdog does
   exactly that, and the operation then fails as a transport error and gets its one
   retry, matching what a socket timeout does on Android.
   */
  private func withWatchdog<T>(
    _ client: SMBClient,
    _ timeoutMs: Int,
    _ body: () async throws -> T
  ) async rethrows -> T {
    let watchdog = Task.detached { [weak self] in
      try await Task.sleep(nanoseconds: UInt64(max(timeoutMs, 1)) * 1_000_000)
      await self?.abort(client)
    }
    defer { watchdog.cancel() }
    return try await body()
  }

  /// Runs while `withWatchdog`'s body is suspended — actor reentrancy is the point.
  private func abort(_ client: SMBClient) {
    client.session.disconnect()
    if self.client === client { drop() }
  }

  // MARK: - Errors

  /**
   Which of the things the user got wrong. Statuses are matched by raw value rather
   than through the vendored `ErrorCode` enum, which doesn't carry all of them, so
   this stays a line-for-line match with SmbConnection.kt's translate().
   */
  private func translate(_ error: ErrorResponse) -> SmbFailure {
    let message = error.errorDescription ?? "SMB request failed"
    switch error.header.status {
    case 0xC000_006D,  // STATUS_LOGON_FAILURE
      0xC000_0022,  // STATUS_ACCESS_DENIED
      0xC000_0072,  // STATUS_ACCOUNT_DISABLED
      0xC000_0193,  // STATUS_PASSWORD_EXPIRED
      0xC000_015B:  // STATUS_LOGON_TYPE_NOT_GRANTED
      return SmbAuthException(message)

    case 0xC000_00CC,  // STATUS_BAD_NETWORK_NAME
      0xC000_00CD:  // STATUS_BAD_NETWORK_PATH
      return SmbNoShareException(message)

    case 0xC000_0034,  // STATUS_OBJECT_NAME_NOT_FOUND
      0xC000_003A:  // STATUS_OBJECT_PATH_NOT_FOUND
      return SmbPathException(message)

    // STATUS_NOT_SUPPORTED. What a server that mandates SMB 3.x answers when the
    // negotiate offers only 2.0.2 and 2.1, which is all the vendored client
    // implements (ios/vendor/VENDOR.md).
    case 0xC000_00BB:
      return SmbDialectException(message)

    default:
      return SmbUnreachableException(
        String(format: "0x%08X: %@", error.header.status, message))
    }
  }

  private func describe(_ target: SmbEndpoint, _ error: Error) -> String {
    "\(target.host):\(target.port) — \(type(of: error)): \(error.localizedDescription)"
  }
}
