package expo.modules.upnpcast

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.util.Log
import java.io.Closeable
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.MulticastSocket
import java.net.NetworkInterface
import java.net.SocketTimeoutException
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Finding renderers, both ways UPnP offers: shout at the network and write down who
 * answers, and listen for the ones announcing themselves.
 *
 * Searches go out on every local network the phone has — Wi-Fi, Ethernet — bound to
 * it explicitly. Left to the default route, the M-SEARCH follows whatever the phone
 * considers its main connection, which with a VPN up or mobile data preferred is
 * not the network the speakers are on, and nothing answers.
 */
object Ssdp {
  private const val ADDRESS = "239.255.255.250"
  private const val PORT = 1900
  private const val MEDIA_RENDERER = "urn:schemas-upnp-org:device:MediaRenderer:1"

  /**
   * What an answer must call itself to be worth a description fetch. `ssdp:all`
   * makes every device answer once per service it has; only the root device and
   * the two renderer-ish types can be a speaker, and asking a router, a printer
   * and a Roku what they are just delays the list.
   */
  private val RENDERER_HINTS = listOf("upnp:rootdevice", "MediaRenderer", "AVTransport")

  /** A device that answered, by the URL of its description. */
  class Reply(val location: String, val address: String)

  /**
   * Local networks worth searching: Wi-Fi and Ethernet, not a VPN tunnel. Empty
   * when the phone has none, in which case the search goes out unbound and takes
   * its chances with the default route.
   */
  fun lanNetworks(context: Context): List<Network> {
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
      ?: return emptyList()
    return manager.allNetworks.filter { network ->
      val caps = manager.getNetworkCapabilities(network) ?: return@filter false
      (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
        caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) &&
        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
    }
  }

  /**
   * Searches every local network for `timeoutMs`, handing over each new answer as it
   * arrives rather than the lot at the end, so a slow speaker does not decide how
   * long the fast ones take to show.
   *
   * Asked with two targets, because the two searches do not find the same set: some
   * renderers only answer a search naming their own device type, and some only
   * answer the catch-all. And asked more than once: UDP loses packets, a device in
   * the middle of something misses a search, and the spec itself says to repeat.
   * Answers are deduplicated by description URL, which is what identifies a device —
   * *not* by address: one box commonly hosts several unrelated UPnP devices on
   * different ports.
   */
  suspend fun discover(
    context: Context,
    timeoutMs: Long,
    onReply: suspend (Reply) -> Unit
  ) = withContext(Dispatchers.IO) {
    val seen = ConcurrentHashMap.newKeySet<String>()
    val networks = lanNetworks(context)
    val targets: List<Network?> = if (networks.isEmpty()) listOf(null) else networks
    Log.i(Soap.TAG, "searching ${targets.size} network(s) for ${timeoutMs}ms")
    val jobs = targets.map { network ->
      launch { searchOn(network, timeoutMs) { reply -> if (seen.add(reply.location)) onReply(reply) } }
    }
    jobs.joinAll()
  }

  private suspend fun searchOn(
    network: Network?,
    timeoutMs: Long,
    onReply: suspend (Reply) -> Unit
  ) = withContext(Dispatchers.IO) {
    runCatching {
      DatagramSocket().use { socket ->
        socket.soTimeout = RECEIVE_SLICE_MS
        socket.broadcast = true
        runCatching { network?.bindSocket(socket) }
          .onFailure { Log.w(Soap.TAG, "could not bind the search to $network: ${it.message}") }
        val group = InetAddress.getByName(ADDRESS)

        val sender = launch {
          for (wait in SEARCH_BURSTS_MS) {
            delay(wait)
            for (target in listOf(MEDIA_RENDERER, "ssdp:all")) {
              val request = buildString {
                append("M-SEARCH * HTTP/1.1\r\n")
                append("HOST: $ADDRESS:$PORT\r\n")
                append("MAN: \"ssdp:discover\"\r\n")
                // Devices stagger their replies randomly across this many seconds
                // to keep from colliding.
                append("MX: 3\r\n")
                append("ST: $target\r\n\r\n")
              }.toByteArray()
              runCatching { socket.send(DatagramPacket(request, request.size, group, PORT)) }
            }
          }
        }

        val deadline = System.currentTimeMillis() + timeoutMs
        val buffer = ByteArray(BUFFER_BYTES)
        var answers = 0
        while (System.currentTimeMillis() < deadline && isActive) {
          val packet = DatagramPacket(buffer, buffer.size)
          try {
            socket.receive(packet)
          } catch (_: SocketTimeoutException) {
            continue
          }
          answers++
          val address = packet.address?.hostAddress ?: continue
          val text = String(packet.data, 0, packet.length)
          if (!text.startsWith("HTTP/1.1 200", ignoreCase = true)) continue
          val kind = headerValue(text, "ST") ?: headerValue(text, "USN") ?: continue
          if (RENDERER_HINTS.none { kind.contains(it, ignoreCase = true) }) continue
          val location = headerValue(text, "LOCATION")
          if (!location.isNullOrEmpty()) onReply(Reply(location, address))
        }
        sender.cancel()
        Log.i(Soap.TAG, "search on ${network ?: "the default route"}: $answers answer(s)")
      }
    }.onFailure { Log.w(Soap.TAG, "search failed: ${it.javaClass.simpleName}: ${it.message}") }
  }

  /**
   * Listens for `ssdp:alive` announcements until closed.
   *
   * Announcements go to the multicast group, which the phone's Wi-Fi stack drops
   * on the floor unless told otherwise: hence the multicast lock, held only while
   * this is open. This is how a device that answers searches badly — a TV that has
   * just woken up, a renderer that only speaks when spoken to by name — still gets
   * found: it says so itself every few minutes, and at boot.
   */
  fun listen(
    context: Context,
    scope: CoroutineScope,
    onAlive: suspend (Reply) -> Unit
  ): Closeable {
    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    val lock = wifi?.createMulticastLock("wavio-upnp")?.apply {
      setReferenceCounted(false)
      runCatching { acquire() }
    }
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    val networks = lanNetworks(context)
    val sockets = mutableListOf<MulticastSocket>()
    val jobs = mutableListOf<Job>()
    val group = InetAddress.getByName(ADDRESS)

    val interfaces: List<NetworkInterface?> = networks.mapNotNull { network ->
      manager?.getLinkProperties(network)?.interfaceName?.let { runCatching { NetworkInterface.getByName(it) }.getOrNull() }
    }.ifEmpty { listOf(null) }

    for (iface in interfaces) {
      val socket = runCatching {
        MulticastSocket(null).apply {
          reuseAddress = true
          soTimeout = RECEIVE_SLICE_MS
          // Other UPnP apps on the phone may hold 1900 too; reuseAddress shares it.
          bind(InetSocketAddress(PORT))
          if (iface != null) joinGroup(InetSocketAddress(group, PORT), iface)
          else joinGroup(group)
        }
      }.onFailure { Log.w(Soap.TAG, "cannot listen for announcements on ${iface?.name}: ${it.message}") }
        .getOrNull() ?: continue
      sockets += socket
      jobs += scope.launch(Dispatchers.IO) {
        val buffer = ByteArray(BUFFER_BYTES)
        while (isActive && !socket.isClosed) {
          val packet = DatagramPacket(buffer, buffer.size)
          try {
            socket.receive(packet)
          } catch (_: SocketTimeoutException) {
            continue
          } catch (_: Exception) {
            break
          }
          val text = String(packet.data, 0, packet.length)
          if (!text.startsWith("NOTIFY", ignoreCase = true)) continue
          if (headerValue(text, "NTS")?.equals("ssdp:alive", ignoreCase = true) != true) continue
          val kind = headerValue(text, "NT") ?: headerValue(text, "USN") ?: continue
          if (RENDERER_HINTS.none { kind.contains(it, ignoreCase = true) }) continue
          val location = headerValue(text, "LOCATION") ?: continue
          val address = packet.address?.hostAddress ?: continue
          onAlive(Reply(location, address))
        }
      }
    }
    Log.i(Soap.TAG, "listening for announcements on ${sockets.size} interface(s)")

    return Closeable {
      for (job in jobs) job.cancel()
      for (socket in sockets) runCatching { socket.close() }
      runCatching { if (lock?.isHeld == true) lock.release() }
    }
  }

  /**
   * A header out of an SSDP message.
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
  // The gap before each burst of M-SEARCHes: at once, then 0.8s and 2s in.
  private val SEARCH_BURSTS_MS = listOf(0L, 800L, 1200L)
}
