package expo.modules.upnpcast

import android.util.Log
import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.StringReader

/**
 * Sonos speakers that are grouped, and the two halves of a stereo pair, are driven
 * through whichever one is the group's coordinator. The others discover normally,
 * report their volume happily, and then refuse to be handed a track — with a
 * generic "transition not available" that says nothing about why.
 *
 * So: only consulted after a refusal, and only on a device that says it is a Sonos.
 * A speaker that took the track never pays for any of this.
 */
object SonosTopology {
  /**
   * The AVTransport control URL for the group this speaker belongs to, or null when
   * there is nothing to redirect to — not a Sonos, on its own, already in charge, or
   * simply not telling us.
   */
  suspend fun coordinatorControlUrl(description: DeviceDescription): String? {
    if (!description.isSonos) return null
    val ownUuid = description.udn ?: return null
    val topology = description.controlUrl(Services.ZONE_GROUP_TOPOLOGY) ?: return null

    val response = Soap.call(topology, Services.ZONE_GROUP_TOPOLOGY, "GetZoneGroupState")
    // The whole topology travels as an escaped document inside the response, so it
    // has to come back out before anything can be read from it.
    val state = Soap.argument(response.body, "ZoneGroupState") ?: return null

    val group = groupContaining(state, ownUuid) ?: return null
    if (group.coordinator == ownUuid) return null
    val location = group.members[group.coordinator] ?: return null

    Log.w(Soap.TAG, "${description.friendlyName} is not its group's coordinator; using $location")
    val coordinator = Soap.fetch(location)?.let { DeviceDescription.parse(it, location) } ?: return null
    return coordinator.controlUrl(Services.AV_TRANSPORT)
  }

  private data class Group(val coordinator: String, val members: Map<String, String>)

  /** The group this UUID is a member of, with each member's description URL. */
  private fun groupContaining(state: String, uuid: String): Group? {
    try {
      val parser = Xml.newPullParser()
      parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
      parser.setInput(StringReader(state))

      var coordinator: String? = null
      var members = mutableMapOf<String, String>()
      var holdsUuid = false
      var event = parser.eventType
      while (event != XmlPullParser.END_DOCUMENT) {
        when {
          event == XmlPullParser.START_TAG && parser.name.equals("ZoneGroup", true) -> {
            coordinator = parser.getAttributeValue(null, "Coordinator")
            members = mutableMapOf()
            holdsUuid = false
          }
          event == XmlPullParser.START_TAG && parser.name.equals("ZoneGroupMember", true) -> {
            val member = parser.getAttributeValue(null, "UUID")
            val location = parser.getAttributeValue(null, "Location")
            if (member != null) {
              if (member == uuid) holdsUuid = true
              if (location != null) members[member] = Soap.unescape(location)
            }
          }
          event == XmlPullParser.END_TAG && parser.name.equals("ZoneGroup", true) -> {
            if (holdsUuid && coordinator != null) return Group(coordinator, members)
          }
        }
        event = parser.next()
      }
    } catch (_: Exception) {
      return null
    }
    return null
  }
}
