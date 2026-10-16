package expo.modules.upnpcast

import android.util.Log
import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.StringReader

/**
 * Sonos topology and room-name support.
 *
 * Sonos transport is coordinator based. A grouped member may answer transport
 * queries differently or refuse operations which must be sent to its coordinator.
 *
 * The topology service gives us the current coordinator/member relationship.
 */
object SonosTopology {

  data class ZoneAttributes(
    val zoneName: String?,
    val targetRoomName: String?,
    val icon: String?,
    val configuration: String?
  )

  data class Member(
    val uuid: String,
    val location: String,
    val invisible: Boolean,
    val zoneName: String?
  )

  data class Group(
    val coordinator: String,
    val members: Map<String, Member>
  )

  data class Topology(
    val groups: List<Group>
  ) {

    fun groupContaining(
      uuid: String
    ): Group? {
      return groups.firstOrNull {
        it.members.containsKey(uuid)
      }
    }

    fun coordinatorFor(
      uuid: String
    ): String? {
      return groupContaining(uuid)?.coordinator
    }

    fun coordinatorLocationFor(
      uuid: String
    ): String? {
      val group = groupContaining(uuid)
        ?: return null

      return group.members[
        group.coordinator
      ]?.location
    }

    fun membersOf(
      uuid: String
    ): List<Member> {
      return groupContaining(uuid)
        ?.members
        ?.values
        ?.toList()
        ?: emptyList()
    }
  }

  /**
   * Gets the current zone/room name.
   *
   * CurrentZoneName is the authoritative Sonos room name.
   */
  suspend fun zoneAttributes(
    description: DeviceDescription
  ): ZoneAttributes? {

    if (!description.isSonos) {
      return null
    }

    val control =
      description.controlUrl(
        Services.DEVICE_PROPERTIES
      ) ?: return null

    val response = Soap.call(
      control,
      Services.DEVICE_PROPERTIES,
      "GetZoneAttributes"
    )

    if (!response.ok) {
      return null
    }

    return ZoneAttributes(
      zoneName =
        Soap.argument(
          response.body,
          "CurrentZoneName"
        )?.takeIf { it.isNotBlank() },

      targetRoomName =
        Soap.argument(
          response.body,
          "CurrentTargetRoomName"
        )?.takeIf { it.isNotBlank() },

      icon =
        Soap.argument(
          response.body,
          "CurrentIcon"
        )?.takeIf { it.isNotBlank() },

      configuration =
        Soap.argument(
          response.body,
          "CurrentConfiguration"
        )?.takeIf { it.isNotBlank() }
    )
  }

  /**
   * Gets the actual Sonos room name.
   *
   * Priority:
   *
   * 1. DeviceProperties CurrentZoneName
   * 2. DeviceProperties CurrentTargetRoomName
   * 3. roomName from device_description.xml
   * 4. friendlyName
   */
  suspend fun zoneName(
    description: DeviceDescription
  ): String? {

    if (!description.isSonos) {
      return null
    }

    val attributes =
      zoneAttributes(description)

    return attributes?.zoneName
      ?: attributes?.targetRoomName
      ?: description.roomName
      ?: description.friendlyName
  }

  /**
   * Reads the complete Sonos topology from GetZoneGroupState.
   */
  suspend fun topology(
    description: DeviceDescription
  ): Topology? {

    if (!description.isSonos) {
      return null
    }

    val control =
      description.controlUrl(
        Services.ZONE_GROUP_TOPOLOGY
      ) ?: return null

    val response = Soap.call(
      control,
      Services.ZONE_GROUP_TOPOLOGY,
      "GetZoneGroupState"
    )

    val state =
      Soap.argument(
        response.body,
        "ZoneGroupState"
      ) ?: return null

    return parseTopology(state)
  }

  /**
   * Returns the coordinator's AVTransport control URL when the supplied
   * device is currently a non-coordinator member.
   */
  suspend fun coordinatorControlUrl(
    description: DeviceDescription
  ): String? {

    if (!description.isSonos) {
      return null
    }

    val ownUuid =
      description.udn
        ?: return null

    val topology =
      topology(description)
        ?: return null

    val coordinator =
      topology.coordinatorFor(ownUuid)
        ?: return null

    if (coordinator == ownUuid) {
      return null
    }

    val location =
      topology.coordinatorLocationFor(ownUuid)
        ?: return null

    Log.w(
      Soap.TAG,
      "${description.friendlyName} is not its group's coordinator; " +
        "using $location"
    )

    val coordinatorDescription =
      Soap.fetch(location)
        ?.let {
          DeviceDescription.parse(
            it,
            location
          )
        }
        ?: return null

    return coordinatorDescription.controlUrl(
      Services.AV_TRANSPORT
    )
  }

  private fun parseTopology(
    state: String
  ): Topology? {

    return try {

      val parser = Xml.newPullParser()

      parser.setFeature(
        XmlPullParser.FEATURE_PROCESS_NAMESPACES,
        false
      )

      parser.setInput(
        StringReader(state)
      )

      val groups = mutableListOf<Group>()

      var currentCoordinator: String? = null
      var currentMembers =
        mutableMapOf<String, Member>()

      var event = parser.eventType

      while (
        event != XmlPullParser.END_DOCUMENT
      ) {

        if (
          event == XmlPullParser.START_TAG &&
          parser.name.equals(
            "ZoneGroup",
            ignoreCase = true
          )
        ) {

          currentCoordinator =
            parser.getAttributeValue(
              null,
              "Coordinator"
            )

          currentMembers =
            mutableMapOf()

        } else if (
          event == XmlPullParser.START_TAG &&
          parser.name.equals(
            "ZoneGroupMember",
            ignoreCase = true
          )
        ) {

          val uuid =
            parser.getAttributeValue(
              null,
              "UUID"
            )

          val rawLocation =
            parser.getAttributeValue(
              null,
              "Location"
            )

          if (
            uuid != null &&
            rawLocation != null
          ) {

            val location =
              Soap.unescape(
                rawLocation
              )

            val invisible =
              parser.getAttributeValue(
                null,
                "Invisible"
              )?.equals(
                "1",
                ignoreCase = true
              ) == true

            val zoneName =
              parser.getAttributeValue(
                null,
                "ZoneName"
              )?.takeIf {
                it.isNotBlank()
              }

            currentMembers[uuid] =
              Member(
                uuid = uuid,
                location = location,
                invisible = invisible,
                zoneName = zoneName
              )
          }

        } else if (
          event == XmlPullParser.END_TAG &&
          parser.name.equals(
            "ZoneGroup",
            ignoreCase = true
          )
        ) {

          val coordinator =
            currentCoordinator

          if (
            coordinator != null &&
            currentMembers.isNotEmpty()
          ) {
            groups.add(
              Group(
                coordinator = coordinator,
                members = currentMembers.toMap()
              )
            )
          }

          currentCoordinator = null
          currentMembers = mutableMapOf()
        }

        event = parser.next()
      }

      Topology(groups)

    } catch (e: Exception) {

      Log.w(
        Soap.TAG,
        "Failed to parse Sonos topology: ${e.message}"
      )

      null
    }
  }
}