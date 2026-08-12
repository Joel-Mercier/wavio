package expo.modules.upnpcast

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException

/**
 * Finding renderers, with the only mechanism UPnP offers: shout at the network and
 * write down who answers.
 *
 * The M-SEARCH goes out multicast, but every reply comes back unicast to the port we
 * sent from, so this needs neither group membership nor a WifiManager multicast lock.
 */
object Ssdp {
  private const val ADDRESS = "239.255.255.250"
  private const val PORT = 1900
  private const val MEDIA_RENDERER = "urn:schemas-upnp-org:device:MediaRenderer:1"

  /**
   * Every device that answered, as description URL -> address.
   *
   * Asked twice, because the two searches do not find the same set: some renderers
   * only answer a search naming their own device type, and some only answer the
   * catch-all. Answers are deduplicated by description URL, which is what identifies
   * a device — *not* by address: one box commonly hosts several unrelated UPnP
   * devices on different ports, and an Android TV answers from its Chromecast stack
   * long before Kodi's renderer gets a word in. Keeping one answer per address drops
   * whichever device happened to be slower, which is always the interesting one.
   *
   * UDP loses packets and nothing here retransmits, so a device missing from one
   * round says nothing about whether it is there — the caller merges results across
   * scans rather than treating each one as the truth.
   */
  suspend fun discover(timeoutMs: Long): Map<String, String> = withContext(Dispatchers.IO) {
    val found = LinkedHashMap<String, String>()
    runCatching {
      DatagramSocket().use { socket ->
        socket.soTimeout = RECEIVE_SLICE_MS
        socket.broadcast = true
        val group = InetAddress.getByName(ADDRESS)
        for (target in listOf(MEDIA_RENDERER, "ssdp:all")) {
          val request = buildString {
            append("M-SEARCH * HTTP/1.1\r\n")
            append("HOST: $ADDRESS:$PORT\r\n")
            append("MAN: \"ssdp:discover\"\r\n")
            // Devices stagger their replies randomly across this many seconds to
            // keep from colliding, so it doubles as the floor on a useful timeout.
            append("MX: 2\r\n")
            append("ST: $target\r\n\r\n")
          }.toByteArray()
          runCatching {
            socket.send(DatagramPacket(request, request.size, group, PORT))
          }
        }

        val deadline = System.currentTimeMillis() + timeoutMs
        val buffer = ByteArray(BUFFER_BYTES)
        while (System.currentTimeMillis() < deadline) {
          val packet = DatagramPacket(buffer, buffer.size)
          try {
            socket.receive(packet)
          } catch (_: SocketTimeoutException) {
            continue
          }
          val address = packet.address?.hostAddress ?: continue
          val location = headerValue(String(packet.data, 0, packet.length), "LOCATION")
          if (!location.isNullOrEmpty()) found.putIfAbsent(location, address)
        }
      }
    }
    found
  }

  /**
   * A header out of an SSDP reply.
   *
   * Split on the first colon only: the value is a URL and carries its own.
   */
  private fun headerValue(response: String, name: String): String? =
    response.lineSequence()
      .firstOrNull { it.startsWith("$name:", ignoreCase = true) }
      ?.substringAfter(':')
      ?.trim()

  private const val RECEIVE_SLICE_MS = 400
  private const val BUFFER_BYTES = 8192
}
