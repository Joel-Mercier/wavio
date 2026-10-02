package expo.modules.upnpcast

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * A synchronized group of Sonos players.
 *
 * Only the coordinator receives media/transport commands.
 *
 * Member speakers are joined with:
 *
 *   x-rincon:<coordinator UUID>
 *
 * This is the mechanism Sonos exposes through AVTransport for grouping
 * players together.
 */
class SonosGroupSession(
  private val sessions: List<RendererSession>
) {

  private val mutex = Mutex()

  private var connected = false

  private var coordinator: RendererSession? = null

  /**
   * Original coordinator for each selected device.
   *
   * If a device was standalone before Wavio connected:
   *
   *   device -> device
   *
   * If it was already in another group:
   *
   *   device -> original group coordinator
   */
  private var originalCoordinators:
    Map<String, String> = emptyMap()

  @Volatile
  var latestRequested = 0.0

  val deviceIds: List<String>
    get() = sessions.map { it.deviceId }

  val coordinatorId: String?
    get() = coordinator?.deviceId

  val isConnected: Boolean
    get() = connected

  suspend fun connect(): Boolean =
    mutex.withLock {

      if (connected) {
        return true
      }

      if (
        sessions.size < 2 ||
        sessions.any { !it.isSonos }
      ) {
        return false
      }

      /*
       * Ask every selected device for the current topology.
       *
       * The first device's topology is sufficient because all Sonos players
       * in the household share the same zone-group topology.
       */
      val first =
        sessions.first()

      val topology =
        SonosTopology.topology(
          first.descriptionSnapshot
        ) ?: return false

      originalCoordinators =
        sessions.associate { session ->
          session.deviceId to
            (
              topology.coordinatorFor(
                session.deviceId
              ) ?: session.deviceId
            )
        }

      /*
       * Wavio deliberately uses the first selected device as the requested
       * coordinator when possible.
       *
       * If it is already a member of a Sonos group, we do not tear that group
       * apart. The selected member is already controlled through its group's
       * coordinator by Sonos.
       *
       * This avoids destroying existing Sonos groups merely because Wavio
       * started playback.
       */
      val coordinatorId =
        originalCoordinators[first.deviceId]
          ?: first.deviceId

      val selectedCoordinator =
        sessions.firstOrNull {
          it.deviceId == coordinatorId
        }

      if (selectedCoordinator != null) {
        coordinator =
          selectedCoordinator
      } else {
        /*
         * The selected first device was already a member of an existing group
         * whose coordinator was not selected.
         *
         * In that case we use the first selected device's existing coordinator
         * by resolving a temporary RendererSession from its topology location.
         *
         * The existing group is intentionally preserved.
         */
        val coordinatorLocation =
          topology.coordinatorLocationFor(
            first.deviceId
          ) ?: return false

        val coordinatorDescription =
          Soap.fetch(
            coordinatorLocation
          )?.let {
            DeviceDescription.parse(
              it,
              coordinatorLocation
            )
          } ?: return false

        val coordinatorUuid =
          coordinatorDescription.udn
            ?: return false

        val temporaryCoordinator =
          RendererSession(
            deviceId = coordinatorUuid,
            address = coordinatorLocation
              .substringAfter("://")
              .substringBefore(":")
              .substringBefore("/"),
            location = coordinatorLocation,
            initialDescription =
              coordinatorDescription
          )

        coordinator =
          temporaryCoordinator
      }

      /*
       * Initialize each selected session. This also resets its generation and
       * transport bookkeeping.
       */
      sessions.forEach {
        it.connect()
      }

      val activeCoordinator =
        coordinator
          ?: return false

      /*
       * Every selected device which is not already part of the coordinator's
       * group is joined to the coordinator.
       *
       * If a selected device was itself a coordinator of an existing Sonos
       * group, Sonos will merge that group as part of the grouping operation.
       * We remember its original coordinator above so disconnect() can restore
       * it.
       */
      for (session in sessions) {

        if (
          session.deviceId ==
          activeCoordinator.deviceId
        ) {
          continue
        }

        val originalCoordinator =
          originalCoordinators[
            session.deviceId
          ]

        if (
          originalCoordinator ==
          activeCoordinator.deviceId
        ) {
          continue
        }

        if (
          !session.joinSonosGroup(
            activeCoordinator.deviceId
          )
        ) {
          restoreOriginalGroupsLocked()
          coordinator = null
          originalCoordinators = emptyMap()
          return false
        }
      }

      connected = true

      true
    }

  suspend fun load(
    track: Track,
    autoplay: Boolean,
    startMs: Long,
    generation: Double
  ): RendererSession.LoadResult =
    mutex.withLock {

      val target =
        coordinator
          ?: return RendererSession.LoadResult(
            false,
            "no_session",
            generation,
            ""
          )

      if (
        generation <
        latestRequested
      ) {
        return RendererSession.LoadResult(
          false,
          "superseded",
          generation,
          ""
        )
      }

      target.latestRequested =
        maxOf(
          target.latestRequested,
          generation
        )

      target.load(
        track,
        autoplay,
        startMs,
        generation
      )
    }

  suspend fun play(
    resumeAtMs: Long = 0
  ): RendererSession.TransportResult =
    mutex.withLock {
      coordinator
        ?.play(resumeAtMs)
        ?: RendererSession.TransportResult(false)
    }

  suspend fun pause():
    RendererSession.TransportResult =
    mutex.withLock {
      coordinator
        ?.pause()
        ?: RendererSession.TransportResult(false)
    }

  suspend fun seek(
    positionMs: Long
  ): RendererSession.TransportResult =
    mutex.withLock {
      coordinator
        ?.seek(positionMs)
        ?: RendererSession.TransportResult(false)
    }

  /**
   * Group volume is intentionally applied to every selected Sonos player.
   *
   * Sonos transport itself is coordinator based, but volume is a per-player
   * RenderingControl operation.
   */
  suspend fun setVolume(
    volume: Int
  ): Boolean =
    mutex.withLock {

      coroutineScope {
        sessions
          .map { session ->
            async {
              session.setVolume(volume)
            }
          }
          .awaitAll()
          .all { it }
      }
    }

    /**
 * Sets the volume of a single selected Sonos player.
 *
 * Volume is RenderingControl, so a member can be addressed individually
 * even though transport is coordinator-based. Returns false if the device
 * id isn't part of this group.
 */
suspend fun setDeviceVolume(
  deviceId: String,
  volume: Int
): Boolean =
  mutex.withLock {
    val target =
      sessions.firstOrNull {
        it.deviceId == deviceId
      } ?: return false

    target.setVolume(volume)
  }
    
    
  /**
   * Returns the coordinator's volume as the group's representative volume.
   */
  suspend fun volume(): Int? =
    mutex.withLock {
      coordinator?.volume()
    }

  suspend fun state():
    RendererSession.State? =
    mutex.withLock {
      coordinator?.state()
    }

  /**
   * Stops playback and then restores only the grouping relationships Wavio
   * changed.
   */
  suspend fun disconnect(): Boolean =
    mutex.withLock {

      if (!connected) {
        return true
      }

      coordinator?.let {
        /*
         * Use a direct Stop instead of relying on the connection epoch because
         * the coordinator can be a temporary session representing an
         * unselected existing group coordinator.
         */
        it.stop(it.connect())
      }

      restoreOriginalGroupsLocked()

      coordinator = null
      originalCoordinators = emptyMap()
      latestRequested = 0.0
      connected = false

      true
    }

  /**
   * Restores the original coordinator relationships.
   *
   * We only touch devices selected by Wavio. The original Sonos coordinator
   * does not need to be selected because SetAVTransportURI can reference it
   * directly by UUID.
   */
  private suspend fun restoreOriginalGroupsLocked() {

    if (originalCoordinators.isEmpty()) {
      return
    }

    /*
     * First, if an originally standalone selected device was a coordinator,
     * make sure it is standalone again before other members are attached.
     */
    for (session in sessions) {

      val original =
        originalCoordinators[
          session.deviceId
        ]

      if (
        original == session.deviceId
      ) {
        /*
         * Calling this on a standalone player is harmless for Sonos, and
         * ensures it isn't left attached to the Wavio-created group.
         */
        session.becomeCoordinatorOfStandaloneGroup()
      }
    }

    /*
     * Now rejoin members to their original coordinators.
     *
     * If the original coordinator was another selected device, it has already
     * been made standalone above.
     */
    for (session in sessions) {

      val original =
        originalCoordinators[
          session.deviceId
        ] ?: continue

      if (
        original ==
        session.deviceId
      ) {
        continue
      }

      session.joinSonosGroup(
        original
      )
    }
  }
}