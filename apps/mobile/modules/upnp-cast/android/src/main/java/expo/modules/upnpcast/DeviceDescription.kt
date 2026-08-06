package expo.modules.upnpcast

import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.StringReader
import java.net.URL

/**
 * A device's own account of itself, fetched from the LOCATION that discovery gave us.
 *
 * Parsed rather than pattern-matched because the interesting part — where to send
 * commands — is a path the manufacturer chose freely, and every device puts its
 * services somewhere different. Guessing `/AVTransport/control` is how a renderer
 * that answers everything else turns out to be unable to play anything.
 */
class DeviceDescription private constructor(
  val friendlyName: String?,
  val modelName: String?,
  val manufacturer: String?,
  val udn: String?,
  private val urlBase: String?,
  private val location: String,
  private val services: List<Service>
) {
  data class Service(val type: String, val controlUrl: String)

  /**
   * Where to send actions for a service, absolute.
   *
   * Matched on a fragment of the service type rather than the whole string so a
   * device advertising AVTransport:2 still resolves. Nesting is deliberately
   * ignored: on Sonos the AVTransport belongs to a MediaRenderer buried inside a
   * ZonePlayer, and which ancestor it hangs from changes nothing about where the
   * commands go.
   */
  fun controlUrl(serviceType: String): String? {
    val service = services.firstOrNull { it.type.contains(serviceType, ignoreCase = true) }
      ?: return null
    if (service.controlUrl.isEmpty()) return null
    // Relative to <URLBase> when the device gives one, and to wherever the
    // description itself was fetched from otherwise.
    val base = urlBase?.takeIf { it.isNotEmpty() } ?: location
    return runCatching { URL(URL(base), service.controlUrl).toString() }.getOrNull()
  }

  val isRenderer: Boolean get() = controlUrl(Services.AV_TRANSPORT) != null

  val isSonos: Boolean
    get() = manufacturer?.contains("Sonos", ignoreCase = true) == true ||
      modelName?.contains("Sonos", ignoreCase = true) == true

  /**
   * A guess, used only to pick an icon.
   *
   * There is no field for this: a TV and a speaker both call themselves a
   * MediaRenderer. The name is the only hint that costs nothing, and being wrong
   * shows the wrong glyph and nothing worse.
   */
  val isTv: Boolean
    get() = listOfNotNull(friendlyName, modelName).any { name ->
      TV_HINTS.any { name.contains(it, ignoreCase = true) }
    }

  companion object {
    private val TV_HINTS = listOf("TV", "Television", "Bravia", "Chromecast", "Roku", "Fire", "Kodi")

    fun parse(xml: String, location: String): DeviceDescription? {
      var friendlyName: String? = null
      var modelName: String? = null
      var manufacturer: String? = null
      var udn: String? = null
      var urlBase: String? = null
      val services = mutableListOf<Service>()

      var serviceType: String? = null
      var controlUrl: String? = null
      var inService = false

      try {
        val parser = Xml.newPullParser()
        parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
        parser.setInput(StringReader(xml))
        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
          if (event == XmlPullParser.START_TAG) {
            when (parser.name.substringAfter(':').lowercase()) {
              "service" -> {
                inService = true
                serviceType = null
                controlUrl = null
              }
              // The first of each belongs to the root device; nested devices
              // repeat them and would otherwise overwrite the name the user picked.
              "friendlyname" -> friendlyName = friendlyName ?: parser.nextText().trim()
              "modelname" -> modelName = modelName ?: parser.nextText().trim()
              "manufacturer" -> manufacturer = manufacturer ?: parser.nextText().trim()
              "udn" -> udn = udn ?: parser.nextText().trim().removePrefix("uuid:")
              "urlbase" -> urlBase = urlBase ?: parser.nextText().trim()
              "servicetype" -> if (inService) serviceType = parser.nextText().trim()
              "controlurl" -> if (inService) controlUrl = parser.nextText().trim()
            }
          } else if (event == XmlPullParser.END_TAG &&
            parser.name.substringAfter(':').equals("service", ignoreCase = true)
          ) {
            inService = false
            val type = serviceType
            val url = controlUrl
            if (type != null && url != null) services.add(Service(type, url))
          }
          event = parser.next()
        }
      } catch (_: Exception) {
        // A description we cannot parse is a device we cannot drive, but it is not
        // proof the device is unusable — the caller keeps it as unverified rather
        // than hiding it.
        return null
      }

      return DeviceDescription(
        friendlyName, modelName, manufacturer, udn, urlBase, location, services
      )
    }
  }
}
