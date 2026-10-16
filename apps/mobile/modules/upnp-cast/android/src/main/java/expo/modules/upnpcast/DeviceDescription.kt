package expo.modules.upnpcast

import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.StringReader
import java.net.URL

/**
 * A device's own account of itself, fetched from the LOCATION supplied by SSDP.
 */
class DeviceDescription private constructor(
  val friendlyName: String?,
  val roomName: String?,
  val modelName: String?,
  val manufacturer: String?,
  val deviceType: String?,
  val udn: String?,
  private val urlBase: String?,
  private val location: String,
  private val services: List<Service>
) {

  data class Service(
    val type: String,
    val controlUrl: String
  )

  /**
   * Returns an absolute control URL for a UPnP service.
   */
  fun controlUrl(serviceType: String): String? {
    val service = services.firstOrNull {
      it.type.contains(
        serviceType,
        ignoreCase = true
      )
    } ?: return null

    if (service.controlUrl.isEmpty()) {
      return null
    }

    val base = urlBase
      ?.takeIf { it.isNotEmpty() }
      ?: location

    return runCatching {
      URL(
        URL(base),
        service.controlUrl
      ).toString()
    }.getOrNull()
  }

  val isRenderer: Boolean
    get() = controlUrl(Services.AV_TRANSPORT) != null

  /**
   * Sonos devices normally identify themselves through the manufacturer,
   * but ZonePlayer device types are also a reliable fallback.
   */
  val isSonos: Boolean
    get() =
      manufacturer?.contains(
        "Sonos",
        ignoreCase = true
      ) == true ||
      modelName?.contains(
        "Sonos",
        ignoreCase = true
      ) == true ||
      deviceType?.contains(
        "ZonePlayer",
        ignoreCase = true
      ) == true

  /**
   * A heuristic used only for choosing the UI icon.
   */
  val isTv: Boolean
    get() = listOfNotNull(
      friendlyName,
      modelName,
      manufacturer
    ).any { name ->
      TV_HINTS.any {
        name.contains(
          it,
          ignoreCase = true
        )
      }
    }

  companion object {

    private val TV_HINTS = listOf(
      "TV",
      "Television",
      "Bravia",
      "Chromecast",
      "Roku",
      "Fire",
      "Kodi"
    )

    fun parse(
      xml: String,
      location: String
    ): DeviceDescription? {

      var friendlyName: String? = null
      var roomName: String? = null
      var modelName: String? = null
      var manufacturer: String? = null
      var deviceType: String? = null
      var udn: String? = null
      var urlBase: String? = null

      val services = mutableListOf<Service>()

      var serviceType: String? = null
      var controlUrl: String? = null
      var inService = false

      try {
        val parser = Xml.newPullParser()

        parser.setFeature(
          XmlPullParser.FEATURE_PROCESS_NAMESPACES,
          false
        )

        parser.setInput(
          StringReader(xml)
        )

        var event = parser.eventType

        while (event != XmlPullParser.END_DOCUMENT) {

          if (event == XmlPullParser.START_TAG) {

            when (
              parser.name
                .substringAfter(':')
                .lowercase()
            ) {

              "service" -> {
                inService = true
                serviceType = null
                controlUrl = null
              }

              "friendlyname" -> {
                friendlyName =
                  friendlyName
                    ?: parser.nextText().trim()
              }

              "roomname" -> {
                roomName =
                  roomName
                    ?: parser.nextText().trim()
              }

              "modelname" -> {
                modelName =
                  modelName
                    ?: parser.nextText().trim()
              }

              "manufacturer" -> {
                manufacturer =
                  manufacturer
                    ?: parser.nextText().trim()
              }

              "devicetype" -> {
                deviceType =
                  deviceType
                    ?: parser.nextText().trim()
              }

              "udn" -> {
                udn =
                  udn
                    ?: parser.nextText()
                      .trim()
                      .removePrefix("uuid:")
              }

              "urlbase" -> {
                urlBase =
                  urlBase
                    ?: parser.nextText().trim()
              }

              "servicetype" -> {
                if (inService) {
                  serviceType =
                    parser.nextText().trim()
                }
              }

              "controlurl" -> {
                if (inService) {
                  controlUrl =
                    parser.nextText().trim()
                }
              }
            }

          } else if (
            event == XmlPullParser.END_TAG &&
            parser.name
              .substringAfter(':')
              .equals(
                "service",
                ignoreCase = true
              )
          ) {

            inService = false

            val type = serviceType
            val url = controlUrl

            if (
              type != null &&
              url != null
            ) {
              services.add(
                Service(
                  type,
                  url
                )
              )
            }
          }

          event = parser.next()
        }

      } catch (_: Exception) {
        return null
      }

      return DeviceDescription(
        friendlyName = friendlyName,
        roomName = roomName,
        modelName = modelName,
        manufacturer = manufacturer,
        deviceType = deviceType,
        udn = udn,
        urlBase = urlBase,
        location = location,
        services = services
      )
    }
  }
}