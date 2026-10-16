package expo.modules.upnpcast

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import java.io.Closeable
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue

class TrackInfo(
  @Field val mime: String = "audio/mpeg",
  @Field val title: String = "",
  @Field val artist: String? = null,
  @Field val album: String? = null,
  @Field val artworkUrl: String? = null,
  @Field val durationSec: Double? = null
) : Record

/**
 * UPnP/DLNA casting module.
 *
 * Generic UPnP renderers use RendererSession.
 *
 * Sonos multi-room playback uses SonosGroupSession, which makes Sonos itself
 * synchronize the players rather than attempting to synchronize independent
 * UPnP streams from the phone.
 */
class UpnpCastModule : Module() {

  private val scope =
    CoroutineScope(
      SupervisorJob() +
        Dispatchers.IO
    )

  @Volatile
  private var pollJob: Job? = null

  @Volatile
  private var sessionEpoch = 0

  @Volatile
  private var listener: Closeable? = null

  private val describing =
    ConcurrentHashMap.newKeySet<String>()

  private val announced =
    ConcurrentHashMap<String, Long>()

  /**
   * Devices discovered by SSDP and/or describe().
   */
  private val known =
    ConcurrentHashMap<String, RendererSession>()

  /**
   * Exactly one of these is active at a time.
   */
  @Volatile
  private var session: RendererSession? = null

  @Volatile
  private var groupSession: SonosGroupSession? = null

  override fun definition() = ModuleDefinition {

    Name("UpnpCast")

    Events(
      "device",
      "state",
      "lost"
    )

    OnDestroy {
      pollJob?.cancel()
      listener?.close()
      scope.cancel()
    }

    AsyncFunction("search") {
      timeoutMs: Double,
      promise: Promise ->

      val context =
        appContext.reactContext

      if (context == null) {
        promise.resolve(
          emptyList<Map<String, Any>>()
        )

        return@AsyncFunction
      }

      scope.launch {

        val found =
          ConcurrentHashMap<
            String,
            Map<String, Any>
          >()

        val fetches =
          ConcurrentLinkedQueue<Job>()

        Ssdp.discover(
          context,
          timeoutMs.toLong()
        ) { reply ->

          fetches += launch {

            resolveDevice(
              reply.location,
              reply.address
            )?.let { device ->

              found[
                device["id"] as String
              ] = device

              sendEvent(
                "device",
                device
              )
            }
          }
        }

        fetches.joinAll()

        promise.resolve(
          found.values.toList()
        )
      }
    }

    AsyncFunction("startListening") {
      promise: Promise ->

      val context =
        appContext.reactContext

      if (
        context == null ||
        listener != null
      ) {

        promise.resolve(
          listener != null
        )

        return@AsyncFunction
      }

      listener =
        Ssdp.listen(
          context,
          scope
        ) { reply ->

          val now =
            System.currentTimeMillis()

          val last =
            announced.put(
              reply.location,
              now
            )

          if (
            last != null &&
            now - last <
              ANNOUNCE_DEDUPE_MS
          ) {
            return@listen
          }

          scope.launch {
            resolveDevice(
              reply.location,
              reply.address
            )?.let {
              sendEvent(
                "device",
                it
              )
            }
          }
        }

      promise.resolve(true)
    }

    AsyncFunction("stopListening") {
      promise: Promise ->

      listener?.close()
      listener = null

      promise.resolve(null)
    }

    /**
     * Re-resolve a previously discovered device.
     */
    AsyncFunction("describe") {
      deviceId: String,
      location: String,
      promise: Promise ->

      scope.launch {

        val description =
          Soap.fetch(location)
            ?.let {
              DeviceDescription.parse(
                it,
                location
              )
            }

        if (
          description == null ||
          !description.isRenderer
        ) {
          promise.resolve(null)
          return@launch
        }

        val address =
          URL(location).host

        if (
          (description.udn ?: address) !=
          deviceId
        ) {
          promise.resolve(null)
          return@launch
        }

        known[deviceId] =
          RendererSession(
            deviceId,
            address,
            location,
            description
          )

        promise.resolve(
          deviceMap(
            deviceId,
            address,
            location,
            description
          )
        )
      }
    }

    /**
     * Probe a known renderer without taking control of it.
     */
    AsyncFunction("probe") {
      deviceId: String,
      promise: Promise ->

      val target =
        known[deviceId]

      if (target == null) {
        promise.resolve(null)
        return@AsyncFunction
      }

      scope.launch {

        promise.resolve(
          target.state()
            ?.let {
              stateMap(it)
            }
        )
      }
    }

    /**
     * Existing single-device API.
     */
    AsyncFunction("connect") {
      deviceId: String,
      promise: Promise ->

      val target =
        known[deviceId]

      if (target == null) {
        promise.resolve(false)
        return@AsyncFunction
      }

      scope.launch {

        disconnectActive()

        if (
          target.state() == null
        ) {
          promise.resolve(false)
          return@launch
        }

        sessionEpoch =
          target.connect()

        session = target

        startSinglePolling()

        promise.resolve(true)
      }
    }

    /**
     * New multi-room Sonos API.
     *
     * Example JS:
     *
     *   UpnpCast.connectMultiple([
     *     "RINCON_...",
     *     "RINCON_...",
     *     "RINCON_..."
     *   ])
     *
     * All supplied devices must be Sonos players.
     */
    AsyncFunction("connectMultiple") {
      deviceIds: List<String>,
      promise: Promise ->

      scope.launch {

        val uniqueIds =
          deviceIds.distinct()

        if (
          uniqueIds.size < 2
        ) {
          promise.resolve(false)
          return@launch
        }

        val targets =
          uniqueIds.mapNotNull {
            known[it]
          }

        if (
          targets.size !=
          uniqueIds.size
        ) {
          promise.resolve(false)
          return@launch
        }

        if (
          targets.any {
            !it.isSonos
          }
        ) {
          promise.resolve(false)
          return@launch
        }

        /*
         * Verify every selected device before modifying its Sonos grouping.
         */
        for (target in targets) {

          if (
            target.state() == null
          ) {
            promise.resolve(false)
            return@launch
          }
        }

        disconnectActive()

        val group =
          SonosGroupSession(
            targets
          )

        if (
          !group.connect()
        ) {
          promise.resolve(false)
          return@launch
        }

        groupSession =
          group

        session = null

        startGroupPolling()

        promise.resolve(
          mapOf(
            "ok" to true,
            "deviceIds" to group.deviceIds,
            "coordinatorId" to group.coordinatorId
          )
        )
      }
    }

    AsyncFunction("load") {
      url: String,
      track: TrackInfo,
      autoplay: Boolean,
      startPositionMs: Double,
      generation: Double,
      promise: Promise ->

      val single =
        session

      val group =
        groupSession

      if (
        single == null &&
        group == null
      ) {

        promise.resolve(
          loadResultMap(
            RendererSession.LoadResult(
              false,
              "no_session",
              generation,
              ""
            )
          )
        )

        return@AsyncFunction
      }

      val trackValue =
        Track(
          url = url,
          mime = track.mime,
          title = track.title,
          artist = track.artist,
          album = track.album,
          artworkUrl = track.artworkUrl,
          durationSeconds =
            (
              track.durationSec
                ?: 0.0
            ).toInt()
        )

      scope.launch {

        val result =
          if (group != null) {

            group.latestRequested =
              maxOf(
                group.latestRequested,
                generation
              )

            group.load(
              trackValue,
              autoplay,
              startPositionMs.toLong(),
              generation
            )

          } else {

            single!!.latestRequested =
              maxOf(
                single.latestRequested,
                generation
              )

            single.load(
              trackValue,
              autoplay,
              startPositionMs.toLong(),
              generation
            )
          }

        promise.resolve(
          loadResultMap(result)
        )
      }
    }

    AsyncFunction("play") {
      resumeAtMs: Double,
      promise: Promise ->

      scope.launch {

        val result =
          groupSession
            ?.play(
              resumeAtMs.toLong()
            )
            ?: session
              ?.play(
                resumeAtMs.toLong()
              )

        promise.resolve(
          result?.ok ?: false
        )
      }
    }

    AsyncFunction("pause") {
      promise: Promise ->

      scope.launch {

        val result =
          groupSession
            ?.pause()
            ?: session?.pause()
            ?: RendererSession.TransportResult(false)

        promise.resolve(
          mapOf(
            "ok" to result.ok,
            "stoppedInstead" to
              result.stoppedInstead
          )
        )
      }
    }

    AsyncFunction("seek") {
      positionMs: Double,
      promise: Promise ->

      scope.launch {

        val result =
          groupSession
            ?.seek(
              positionMs.toLong()
            )
            ?: session
              ?.seek(
                positionMs.toLong()
              )

        promise.resolve(
          result?.ok ?: false
        )
      }
    }

    AsyncFunction("pollNow") {
      promise: Promise ->

      scope.launch {

        val state =
          groupSession
            ?.state()
            ?: session?.state()

        state?.let {
          sendEvent(
            "state",
            stateMap(it)
          )
        }

        promise.resolve(null)
      }
    }

    /**
     * For a Sonos group this applies the requested volume to each selected
     * speaker rather than only changing the coordinator.
     */
    AsyncFunction("setVolume") {
      volume: Int,
      promise: Promise ->

      scope.launch {

        val result =
          groupSession
            ?.setVolume(volume)
            ?: session
              ?.setVolume(volume)
            ?: false

        promise.resolve(result)
      }
    }
    
    /**
 * Sets the volume of one renderer in the active group, leaving the others
 * untouched. The JS side sends deviceId and a 0..100 percent value.
 */
AsyncFunction("setDeviceVolume") {
  deviceId: String,
  volume: Int,
  promise: Promise ->

  scope.launch {

    val clamped =
      volume.coerceIn(0, 100)

    val result =
      groupSession
        ?.setDeviceVolume(deviceId, clamped)
        ?: session
          ?.let {
            if (it.deviceId == deviceId)
              it.setVolume(clamped)
            else false
          }
        ?: false

    promise.resolve(result)
  }
}

    AsyncFunction("getVolume") {
      promise: Promise ->

      scope.launch {

        val result =
          groupSession
            ?.volume()
            ?: session?.volume()

        promise.resolve(result)
      }
    }

    AsyncFunction("disconnect") {
      promise: Promise ->

      scope.launch {

        disconnectActive()

        promise.resolve(true)
      }
    }
  }

  /**
   * Disconnect whatever Wavio currently controls.
   */
  private suspend fun disconnectActive() {

    pollJob?.cancel()
    pollJob = null

    val group =
      groupSession

    groupSession = null

    if (group != null) {
      group.disconnect()
    }

    val current =
      session

    val epoch =
      sessionEpoch

    session = null

    if (current != null) {
      current.stop(epoch)
    }
  }

  private suspend fun resolveDevice(
    location: String,
    address: String
  ): Map<String, Any>? {

    if (
      !describing.add(location)
    ) {
      return null
    }

    try {

      val xml =
        Soap.fetch(location)
          ?: Soap.fetch(
            location,
            Soap.SLOW_FETCH_TIMEOUT_MS
          )
          ?: return null

      val description =
        DeviceDescription.parse(
          xml,
          location
        ) ?: return null

      if (
        !description.isRenderer
      ) {
        return null
      }

      val id =
        description.udn
          ?: address

      known[id] =
        RendererSession(
          id,
          address,
          location,
          description
        )

      return deviceMap(
        id,
        address,
        location,
        description
      )

    } finally {
      describing.remove(location)
    }
  }

  private fun startSinglePolling() {

    pollJob?.cancel()

    pollJob =
      scope.launch {

        var silentSince = 0L
        var interval =
          POLL_INTERVAL_MS

        while (isActive) {

          val current =
            session
              ?: break

          val state =
            current.state()

          val now =
            System.currentTimeMillis()

          if (state != null) {

            silentSince = 0L

            sendEvent(
              "state",
              stateMap(state)
            )

            interval =
              if (
                state.playbackState ==
                  "PLAYING" ||
                state.playbackState ==
                  "TRANSITIONING"
              ) {
                POLL_INTERVAL_MS
              } else {
                IDLE_POLL_INTERVAL_MS
              }

          } else {

            if (
              silentSince == 0L
            ) {
              silentSince = now
            }

            if (
              now - silentSince >=
              LOST_AFTER_MS
            ) {

              sendEvent(
                "lost",
                mapOf(
                  "deviceId" to
                    current.deviceId
                )
              )

              break
            }
          }

          delay(interval)
        }
      }
  }

  private fun startGroupPolling() {

    pollJob?.cancel()

    pollJob =
      scope.launch {

        var silentSince = 0L
        var interval =
          POLL_INTERVAL_MS

        while (isActive) {

          val group =
            groupSession
              ?: break

          val state =
            group.state()

          val now =
            System.currentTimeMillis()

          if (state != null) {

            silentSince = 0L

            sendEvent(
              "state",
              stateMap(state)
            )

            interval =
              if (
                state.playbackState ==
                  "PLAYING" ||
                state.playbackState ==
                  "TRANSITIONING"
              ) {
                POLL_INTERVAL_MS
              } else {
                IDLE_POLL_INTERVAL_MS
              }

          } else {

            if (
              silentSince == 0L
            ) {
              silentSince = now
            }

            if (
              now - silentSince >=
              LOST_AFTER_MS
            ) {

              sendEvent(
                "lost",
                mapOf(
                  "deviceIds" to
                    group.deviceIds,
                  "coordinatorId" to
                    group.coordinatorId
                )
              )

              break
            }
          }

          delay(interval)
        }
      }
  }

  private fun loadResultMap(
    result: RendererSession.LoadResult
  ): Map<String, Any?> =
    mapOf(
      "ok" to result.ok,
      "reason" to result.reason,
      "generation" to result.generation,
      "trackUri" to result.trackUri
    )

  /**
   * Build the JS-facing device description.
   *
   * For Sonos:
   *
   *   name = actual room/zone name
   *
   * while friendlyName remains available as hardware information.
   */
  private suspend fun deviceMap(
    id: String,
    address: String,
    location: String,
    description: DeviceDescription
  ): Map<String, Any> {

    val sonosZoneName =
      if (description.isSonos) {
        SonosTopology.zoneName(
          description
        )
      } else {
        null
      }

    val displayName =
      sonosZoneName
        ?.takeIf {
          it.isNotBlank()
        }
        ?: description.roomName
          ?.takeIf {
            it.isNotBlank()
          }
        ?: description.friendlyName
          ?.takeIf {
            it.isNotBlank()
          }
        ?: address

    return mapOf(
      "id" to id,

      /*
       * This is now the actual user-facing name.
       *
       * For Sonos:
       *   Living Room
       *   Family Room
       *   Kitchen
       */
      "name" to displayName,

      /*
       * Preserve the hardware/UPnP name too.
       */
      "friendlyName" to (
        description.friendlyName
          ?: ""
      ),

      "zoneName" to (
        sonosZoneName
          ?: ""
      ),

      "roomName" to (
        description.roomName
          ?: ""
      ),

      "modelName" to (
        description.modelName
          ?: ""
      ),

      "manufacturer" to (
        description.manufacturer
          ?: ""
      ),

      "address" to address,

      "location" to location,

      "isSonos" to
        description.isSonos,

      "isTV" to
        description.isTv
    )
  }

  private fun stateMap(
    state: RendererSession.State
  ): Map<String, Any> =
    mapOf(
      "playbackState" to
        state.playbackState,

      "transportStatus" to
        state.transportStatus,

      "positionMs" to
        state.positionMs.toDouble(),

      "durationMs" to
        state.durationMs.toDouble(),

      "trackUri" to
        state.trackUri,

      "generation" to
        state.generation
    )

  private companion object {

    const val POLL_INTERVAL_MS =
      1000L

    const val IDLE_POLL_INTERVAL_MS =
      2000L

    const val LOST_AFTER_MS =
      8000L

    const val ANNOUNCE_DEDUPE_MS =
      5000L
  }
}