package expo.modules.castserver

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The phone as a media server for its own cast sessions. See [CastServer].
 *
 * Every function is synchronous and cheap — binding a socket, hashing a key, asking
 * the kernel for a route — because the load paths in services/cast.ts and
 * services/upnp.ts call them between a queue move and the receiver's LOAD.
 */
class CastServerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CastServer")

    Events("request")

    OnCreate {
      appContext.reactContext?.applicationContext?.let { CastServer.init(it) }
      CastServer.onRequest = { event -> sendEvent("request", event) }
    }

    OnDestroy {
      CastServer.onRequest = null
    }

    Function("startSession") { receiverHost: String, preferredPort: Int, token: String? ->
      CastServer.startSession(receiverHost, preferredPort, token)
    }

    Function("register") { id: String, source: Map<String, Any?>, ext: String, mime: String ->
      CastServer.register(id, source, ext, mime)
    }

    Function("requestCount") { url: String -> CastServer.requestCount(url) }

    Function("sessionRequestCount") { CastServer.sessionRequestCount() }

    Function("setServing") { active: Boolean -> CastServer.setServing(active) }

    Function("setRequestEvents") { enabled: Boolean -> CastServer.requestEvents = enabled }

    Function("endSession") { CastServer.endSession() }
  }
}
