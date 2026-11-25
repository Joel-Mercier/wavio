package expo.modules.castserver

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress

/**
 * Which of this phone's addresses a receiver should be told to fetch from.
 *
 * Only ever an address on a Wi-Fi or Ethernet network. A phone on Wi-Fi usually
 * also holds a cellular address, and on IPv6 that one is often globally routable:
 * listening there would offer the user's files to the carrier's network. A VPN's
 * tunnel address (Tailscale, WireGuard) is no good either, since a TV can't reach it.
 */
internal object RouteAddress {
  private val IPV4_LITERAL = Regex("""^\d{1,3}(\.\d{1,3}){3}$""")

  /**
   * The receiver's address as handed over by JS: the Cast SDK's
   * `InetAddress.toString()` (`/192.168.1.5`, `name/192.168.1.5`) or the host of a
   * UPnP description URL. Literals only: resolving a name here would be a DNS query
   * on the JS thread, and both sources already give an address.
   */
  fun literal(raw: String): InetAddress? {
    var host = raw.trim().substringAfterLast('/')
    if (host.startsWith("[")) host = host.removePrefix("[").substringBefore(']')
    else if (host.count { it == ':' } == 1) host = host.substringBefore(':')
    if (host.isEmpty()) return null
    val looksNumeric = IPV4_LITERAL.matches(host) || host.contains(':')
    if (!looksNumeric) return null
    return runCatching { InetAddress.getByName(host) }.getOrNull()
  }

  /**
   * The local address on the route to [receiver], when that route leaves through a
   * Wi-Fi or Ethernet network. Otherwise the first IPv4 address of such a network:
   * a phone routing everything through a VPN still *receives* on its Wi-Fi address,
   * which is all the receiver needs. Null when the phone is on no local network.
   *
   * Opening a UDP socket and connecting it sends nothing; it only asks the kernel
   * which source address it would use.
   */
  fun forReceiver(context: Context, receiver: InetAddress?): InetAddress? {
    val local = localNetworkAddresses(context)
    if (local.isEmpty()) return null
    if (receiver != null) {
      val routed = runCatching {
        DatagramSocket().use { socket ->
          socket.connect(receiver, DISCARD_PORT)
          socket.localAddress
        }
      }.getOrNull()
      if (routed != null && local.any { it == routed }) return routed
    }
    return local.firstOrNull { it is Inet4Address } ?: local.first()
  }

  private fun localNetworkAddresses(context: Context): List<InetAddress> {
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
      ?: return emptyList()
    val addresses = mutableListOf<InetAddress>()
    @Suppress("DEPRECATION")
    for (network in manager.allNetworks) {
      val capabilities = manager.getNetworkCapabilities(network) ?: continue
      val local = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
      if (!local || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue
      val properties = manager.getLinkProperties(network) ?: continue
      for (link in properties.linkAddresses) {
        val address = link.address
        if (address.isLoopbackAddress || address.isAnyLocalAddress) continue
        // A link-local IPv6 address needs a scope id in the URL, which no receiver
        // can be relied on to parse.
        if (address is Inet6Address && address.isLinkLocalAddress) continue
        addresses += address
      }
    }
    return addresses.sortedBy { if (it is Inet4Address) 0 else 1 }
  }

  fun authority(address: InetAddress, port: Int): String {
    val host = address.hostAddress ?: return "127.0.0.1:$port"
    return if (address is Inet6Address) "[${host.substringBefore('%')}]:$port" else "$host:$port"
  }

  private const val DISCARD_PORT = 9
}
