package expo.modules.httpstack

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import okhttp3.HttpUrl
import okhttp3.Request

internal enum class Route { OKHTTP, CRONET }

/** Why a host stays on OkHttp even with a ready engine, as reported to JS. */
internal enum class HostBlocker(val wire: String) {
  CUSTOM_TLS("custom-tls"),
  TLS_FALLBACK("tls-fallback"),
}

internal object TransportPolicy {
  // Long enough to stop paying a failed handshake per request, short enough that
  // a transient TLS failure (captive portal, middlebox) doesn't last the process.
  private val PIN_NANOS = TimeUnit.MINUTES.toNanos(5)
  private val pinnedUntil = ConcurrentHashMap<String, Long>()

  fun decide(request: Request, vetoes: Collection<TransportVeto>): Route = when {
    // QUIC needs TLS; also keeps expo/fetch's http://filesystem.local on OkHttp.
    !request.isHttps -> Route.OKHTTP
    // Cronet has no WebSocket support.
    request.header("Upgrade") != null -> Route.OKHTTP
    isPinned(request.url.host) -> Route.OKHTTP
    vetoed(request, vetoes) -> Route.OKHTTP
    else -> Route.CRONET
  }

  fun blockerFor(host: String, vetoes: Collection<TransportVeto>): HostBlocker? {
    val url = runCatching { HttpUrl.Builder().scheme("https").host(host).build() }
      .getOrNull() ?: return null
    return when {
      vetoed(Request.Builder().url(url).build(), vetoes) -> HostBlocker.CUSTOM_TLS
      isPinned(host) -> HostBlocker.TLS_FALLBACK
      else -> null
    }
  }

  fun pin(host: String) {
    pinnedUntil[host.lowercase()] = System.nanoTime() + PIN_NANOS
    HttpStack.notifyChanged()
  }

  fun clearPinned() {
    pinnedUntil.clear()
    HttpStack.notifyChanged()
  }

  private fun isPinned(host: String): Boolean {
    val key = host.lowercase()
    val until = pinnedUntil[key] ?: return false
    if (System.nanoTime() - until < 0) return true
    pinnedUntil.remove(key, until)
    return false
  }

  private fun vetoed(request: Request, vetoes: Collection<TransportVeto>): Boolean =
    vetoes.any { veto -> runCatching { veto.mustUseOkHttp(request) }.getOrDefault(true) }
}
