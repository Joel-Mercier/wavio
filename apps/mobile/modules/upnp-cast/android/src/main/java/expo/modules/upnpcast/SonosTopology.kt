package expo.modules.upnpcast

import android.util.Log
import android.util.Xml
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.xmlpull.v1.XmlPullParser
import java.io.StringReader

/**
 * Sonos speakers that are grouped, and the two halves of a stereo pair, are driven
 * through whichever one is the group's coordinator. The others discover normally,
 * report their volume happily, and then refuse to be handed a track — with a
 * generic "transition not available" that says nothing about why.
 *
 * Every speaker in a household answers with the same topology, so one answer is
 * cached for all of them, briefly: discovery asks once per speaker in a burst.
 */
object SonosTopology {
  data class Member(
    val uuid: String,
    val location: String,
    val zoneName: String?,
    /** The hidden half of a stereo pair, a sub, a surround: never offered on its own. */
    val invisible: Boolean
  )

  data class Group(val coordinator: String, val members: List<Member>) {
    val visibleMembers: List<Member> get() = members.filter { !it.invisible }
  }

  class Topology(val groups: List<Group>) {
    fun groupOf(uuid: String): Group? = groups.firstOrNull { group -> group.members.any { it.uuid == uuid } }
    fun member(uuid: String): Member? = groups.firstNotNullOfOrNull { group -> group.members.firstOrNull { it.uuid == uuid } }
  }

  private val fetching = Mutex()
  @Volatile private var cached: Topology? = null
  @Volatile private var cachedAt = 0L

  /**
   * The household this speaker belongs to, or null when it is not a Sonos or will
   * not say. `fresh` skips the cache: right after a group change, or before
   * showing the group to someone about to change it.
   */
  suspend fun read(description: DeviceDescription, fresh: Boolean = false): Topology? {
    if (!description.isSonos) return null
    val uuid = description.udn ?: return null
    return fetching.withLock {
      val recent = cached?.takeIf { System.currentTimeMillis() - cachedAt < CACHE_MS }
      if (!fresh && recent?.groupOf(uuid) != null) return@withLock recent
      val control = description.controlUrl(Services.ZONE_GROUP_TOPOLOGY) ?: return@withLock null
      val response = Soap.call(control, Services.ZONE_GROUP_TOPOLOGY, "GetZoneGroupState")
      // The whole topology travels as an escaped document inside the response, so it
      // has to come back out before anything can be read from it.
      val state = Soap.argument(response.body, "ZoneGroupState") ?: return@withLock null
      parse(state)?.also {
        cached = it
        cachedAt = System.currentTimeMillis()
      }
    }
  }

  fun invalidate() {
    cached = null
  }

  /**
   * The description of whoever coordinates this speaker's group — itself when it is
   * in charge or on its own. Null when it is not a Sonos or the household will not
   * say, which leaves the caller where it was.
   */
  suspend fun coordinatorOf(description: DeviceDescription, fresh: Boolean = false): DeviceDescription? {
    val ownUuid = description.udn ?: return null
    val group = read(description, fresh)?.groupOf(ownUuid) ?: return null
    if (group.coordinator == ownUuid) return description
    val location = group.members.firstOrNull { it.uuid == group.coordinator }?.location ?: return null
    Log.w(Soap.TAG, "${description.displayName} is not its group's coordinator; using $location")
    return Soap.fetch(location)?.let { DeviceDescription.parse(it, location) }
  }

  /**
   * Pre-10.1 firmware sends the groups without the `ZoneGroups` wrapper, which is
   * why groups are found wherever they are rather than under a fixed path.
   */
  private fun parse(state: String): Topology? {
    try {
      val parser = Xml.newPullParser()
      parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
      parser.setInput(StringReader(state))

      val groups = mutableListOf<Group>()
      var coordinator: String? = null
      var members = mutableListOf<Member>()
      var event = parser.eventType
      while (event != XmlPullParser.END_DOCUMENT) {
        val name = parser.name
        when {
          event == XmlPullParser.START_TAG && name.equals("ZoneGroup", true) -> {
            coordinator = parser.getAttributeValue(null, "Coordinator")
            members = mutableListOf()
          }
          event == XmlPullParser.START_TAG &&
            (name.equals("ZoneGroupMember", true) || name.equals("Satellite", true)) -> {
            val uuid = parser.getAttributeValue(null, "UUID")
            val location = parser.getAttributeValue(null, "Location")
            if (uuid != null && location != null) {
              members += Member(
                uuid = uuid,
                location = location,
                zoneName = parser.getAttributeValue(null, "ZoneName")?.takeIf { it.isNotBlank() },
                invisible = name.equals("Satellite", true) ||
                  parser.getAttributeValue(null, "Invisible") == "1"
              )
            }
          }
          event == XmlPullParser.END_TAG && name.equals("ZoneGroup", true) -> {
            val leader = coordinator
            if (leader != null && members.isNotEmpty()) groups += Group(leader, members)
            coordinator = null
          }
        }
        event = parser.next()
      }
      return Topology(groups)
    } catch (_: Exception) {
      return null
    }
  }

  private const val CACHE_MS = 3000L
}
