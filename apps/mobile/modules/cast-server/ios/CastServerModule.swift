import ExpoModulesCore

/**
 The phone as a media server for its own cast sessions. See CastServer.swift, and the
 Android module (the reference implementation), whose function names, argument order
 and return shapes this must match.
 */
public class CastServerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CastServer")

    Events("request")

    OnCreate {
      CastServer.shared.onRequest = { [weak self] event in
        self?.sendEvent("request", event)
      }
    }

    OnDestroy {
      CastServer.shared.onRequest = nil
    }

    Function("startSession") {
      (receiverHost: String, preferredPort: Int, token: String?) -> [String: Any]? in
      CastServer.shared.startSession(
        receiverHost: receiverHost, preferredPort: preferredPort, preferredToken: token)
    }

    Function("register") {
      (id: String, source: [String: Any], ext: String, mime: String) -> String? in
      CastServer.shared.register(id: id, record: source, ext: ext, mime: mime)
    }

    Function("requestCount") { (url: String) -> Int in
      CastServer.shared.requestCount(url: url)
    }

    Function("sessionRequestCount") { () -> Int in
      CastServer.shared.sessionRequestCount()
    }

    // Nothing to hold on iOS: there is no wake lock to take, and a suspended app
    // can't be kept serving by one (see CastServer.swift).
    Function("setServing") { (_: Bool) in }

    Function("setRequestEvents") { (enabled: Bool) in
      CastServer.shared.requestEvents = enabled
    }

    Function("endSession") {
      CastServer.shared.endSession()
    }
  }
}
