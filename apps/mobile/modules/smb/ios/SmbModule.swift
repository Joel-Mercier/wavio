import ExpoModulesCore

/**
 SMB2 file access for the network-share library backend.

 Every function takes its target rather than being configured once, so JS never has
 to push credentials down here or sequence a `connect` before anything else:
 `bridgeUrl` can be the first call after a cold start. `SmbStore` caches the session
 behind that, keyed on the target, so passing it each time costs nothing.

 Reading bytes is deliberately *not* exposed. Playback needs an HTTP bridge anyway
 (nothing in AVFoundation speaks SMB), so the JS side reads ranges through that same
 bridge — one path to get right, exercised from the first scan rather than first at
 playback. See services/fileSource/smb.ts.

 The Android module is the reference implementation; this must match its function
 names, argument order, record shapes and error codes exactly.
 */
public class SmbModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Smb")

    // Synchronous because FileSource.playableUrl is, and it is called during a
    // track change. Only binds a loopback socket; no SMB traffic happens here.
    Function("bridgeUrl") { (target: SmbTargetRecord, path: String, timeoutMs: Int) -> String in
      try SmbBridge.shared.urlFor(target.endpoint(), path: path, timeoutMs: timeoutMs)
    }

    AsyncFunction("list") {
      (target: SmbTargetRecord, path: String, timeoutMs: Int) async throws -> [[String: Any]] in
      try await failing {
        try await SmbStore.shared.list(target.endpoint(), path: path, timeoutMs: timeoutMs)
      }
    }

    AsyncFunction("exists") {
      (target: SmbTargetRecord, path: String, timeoutMs: Int) async throws -> Bool in
      try await failing {
        try await SmbStore.shared.exists(target.endpoint(), path: path, timeoutMs: timeoutMs)
      }
    }

    /**
     Reachability and credential check in one, used by both the login flow and the
     periodic server probe. Rejects with a coded error so login can tell "wrong
     password" from "no such share" from "nothing there".
     */
    AsyncFunction("probe") { (target: SmbTargetRecord, timeoutMs: Int) async throws -> Bool in
      try await failing {
        try await SmbStore.shared.probe(target.endpoint(), timeoutMs: timeoutMs)
      }
    }

    /// Drops the cached session — on sign-out, or a switch to another server.
    AsyncFunction("disconnect") { () async -> Bool in
      SmbBridge.shared.stop()
      await SmbStore.shared.reset()
      return true
    }

    OnDestroy {
      SmbBridge.shared.stop()
      Task { await SmbStore.shared.reset() }
    }
  }
}

/**
 Every rejection that reaches JS carries one of this module's codes: the ones raised
 deliberately pass through, and anything else becomes "unreachable", whose copy tells
 the user to check the address — the right advice for a failure we don't understand.
 Mirrors SmbModule.kt's submit().
 */
private func failing<T>(_ body: () async throws -> T) async throws -> T {
  do {
    return try await body()
  } catch let failure as SmbFailure {
    throw failure
  } catch {
    throw SmbUnreachableException("\(type(of: error)): \(error.localizedDescription)")
  }
}
