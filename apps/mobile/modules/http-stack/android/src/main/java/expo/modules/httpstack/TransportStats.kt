package expo.modules.httpstack

import java.util.concurrent.ConcurrentHashMap
import okhttp3.Protocol

/** The last protocol seen per host while HTTP/3 is enabled. */
internal object TransportStats {
  private val lastProtocol = ConcurrentHashMap<String, String>()

  fun recordCronet(host: String, protocol: Protocol) {
    record(
      host,
      when (protocol) {
        Protocol.QUIC -> "h3"
        Protocol.HTTP_2 -> "h2"
        else -> "http/1.1"
      },
    )
  }

  fun recordOkHttp(host: String, protocol: Protocol) = record(host, protocol.toString())

  fun protocolFor(host: String): String? = lastProtocol[host.lowercase()]

  fun clear() = lastProtocol.clear()

  private fun record(host: String, protocol: String) {
    if (lastProtocol.put(host.lowercase(), protocol) != protocol) HttpStack.notifyChanged()
  }
}
