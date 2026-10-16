package expo.modules.upnpcast

import android.util.Log
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * A connected renderer: where to send its commands, and how to get a track onto it.
 *
 * Generic UPnP/DLNA renderers continue to work exactly as before.
 *
 * Sonos-specific group operations are exposed separately so that SonosGroupSession
 * can construct and manage a synchronized Sonos group without making generic
 * renderers aware of Sonos semantics.
 */
class RendererSession(
  val deviceId: String,
  val address: String,
  val location: String,
  initialDescription: DeviceDescription
) {

  @Volatile
  private var description: DeviceDescription =
    initialDescription

  @Volatile
  private var avTransport: String? =
    initialDescription.controlUrl(
      Services.AV_TRANSPORT
    )

  private val renderingControl: String? =
    initialDescription.controlUrl(
      Services.RENDERING_CONTROL
    )

  private val mutex = Mutex()

  @Volatile
  private var activeGeneration = 0.0

  @Volatile
  var latestRequested = 0.0

  @Volatile
  private var epoch = 0

  @Volatile
  private var lastUri: String? = null

  @Volatile
  private var lastTransportState: String? = null

  val descriptionSnapshot: DeviceDescription
    get() = description

  val isSonos: Boolean
    get() = description.isSonos

  data class State(
    val playbackState: String,
    val transportStatus: String,
    val positionMs: Long,
    val durationMs: Long,
    val trackUri: String,
    val generation: Double
  )

  data class LoadResult(
    val ok: Boolean,
    val reason: String?,
    val generation: Double,
    val trackUri: String
  )

  data class TransportResult(
    val ok: Boolean,
    val stoppedInstead: Boolean = false
  )

  fun connect(): Int {
    activeGeneration = 0.0
    latestRequested = 0.0
    lastUri = null
    lastTransportState = null

    return ++epoch
  }

  /**
   * Join this Sonos player to another Sonos player's group.
   *
   * Sonos defines x-rincon:<UUID> as a special AVTransport URI. Setting that
   * URI on the joining player makes it a member of the coordinator's group.
   */
  suspend fun joinSonosGroup(
    coordinatorId: String
  ): Boolean = mutex.withLock {

    if (!description.isSonos) {
      return false
    }

    if (deviceId == coordinatorId) {
      return true
    }

    val control =
      avTransport
        ?: refreshControlUrl()
        ?: return false

    val result = Soap.call(
      control,
      Services.AV_TRANSPORT,
      "SetAVTransportURI",
      "<InstanceID>0</InstanceID>" +
        "<CurrentURI>" +
        Soap.escape("x-rincon:$coordinatorId") +
        "</CurrentURI>" +
        "<CurrentURIMetaData></CurrentURIMetaData>"
    )

    if (result.ok) {
      lastUri = null
      lastTransportState = "STOPPED"
    }

    result.ok
  }

  /**
   * Remove this Sonos player from its current group.
   *
   * Sonos documents this action as reverting the player to a standalone group.
   */
  suspend fun becomeCoordinatorOfStandaloneGroup(): Boolean =
    mutex.withLock {

      if (!description.isSonos) {
        return false
      }

      val control =
        avTransport
          ?: refreshControlUrl()
          ?: return false

      val result = Soap.call(
        control,
        Services.AV_TRANSPORT,
        "BecomeCoordinatorOfStandaloneGroup",
        "<InstanceID>0</InstanceID>"
      )

      if (result.ok) {
        lastUri = null
        lastTransportState = "STOPPED"
      }

      result.ok
    }

  suspend fun load(
    track: Track,
    autoplay: Boolean,
    startMs: Long,
    generation: Double
  ): LoadResult = mutex.withLock {

    if (generation < latestRequested) {
      return superseded(generation)
    }

    activeGeneration = generation

    val control =
      avTransport
        ?: refreshControlUrl()
        ?: return LoadResult(
          false,
          "unreachable",
          generation,
          ""
        )

    stopBeforeHandover(control)

    var attempt =
      handover(
        control,
        track
      )

    if (!attempt.ok) {

      val coordinator =
        SonosTopology.coordinatorControlUrl(
          description
        )

      if (
        coordinator != null &&
        coordinator != control
      ) {

        stopBeforeHandover(
          coordinator,
          force = true
        )

        attempt =
          handover(
            coordinator,
            track
          )

        if (attempt.ok) {
          avTransport = coordinator
        }
      }
    }

    if (!attempt.ok) {

      avTransport = null

      return LoadResult(
        false,
        if (attempt.fault == null) {
          "unreachable"
        } else {
          "refused"
        },
        generation,
        ""
      )
    }

    val previousUri = lastUri

    lastUri = track.url

    startAfterHandover(
      track,
      autoplay,
      startMs,
      previousUri,
      generation
    )
  }

  private fun superseded(
    generation: Double
  ) =
    LoadResult(
      false,
      "superseded",
      generation,
      ""
    )

  private suspend fun stopBeforeHandover(
    control: String,
    force: Boolean = false
  ) {

    val idle =
      lastTransportState == "STOPPED" ||
        lastTransportState == "NO_MEDIA_PRESENT"

    if (
      idle &&
      !force
    ) {
      return
    }

    Soap.call(
      control,
      Services.AV_TRANSPORT,
      "Stop",
      INSTANCE
    )

    lastTransportState = "STOPPED"
  }

  private suspend fun handover(
    control: String,
    track: Track
  ): Soap.Result {

    var attempt =
      setUri(
        control,
        track,
        withMetadata = true
      )

    if (
      attempt.refused &&
      attempt.errorCode in MIME_FAULTS
    ) {

      Log.w(
        Soap.TAG,
        "renderer refused ${track.mime} " +
          "(${attempt.errorCode}); retrying with wildcard type"
      )

      attempt =
        setUri(
          control,
          track.copy(mime = "*"),
          withMetadata = true
        )
    }

    if (attempt.refused) {

      Log.w(
        Soap.TAG,
        "renderer refused track metadata; retrying URI alone"
      )

      attempt =
        setUri(
          control,
          track,
          withMetadata = false
        )
    }

    return attempt
  }

  private suspend fun setUri(
    control: String,
    track: Track,
    withMetadata: Boolean
  ): Soap.Result {

    val metadata =
      if (withMetadata) {
        Soap.escape(
          Didl.forTrack(track)
        )
      } else {
        ""
      }

    return Soap.call(
      control,
      Services.AV_TRANSPORT,
      "SetAVTransportURI",
      "<InstanceID>0</InstanceID>" +
        "<CurrentURI>" +
        Soap.escape(track.url) +
        "</CurrentURI>" +
        "<CurrentURIMetaData>" +
        metadata +
        "</CurrentURIMetaData>"
    )
  }

  private suspend fun startAfterHandover(
    track: Track,
    autoplay: Boolean,
    startMs: Long,
    previousUri: String?,
    generation: Double
  ): LoadResult {

    if (!autoplay) {

      pauseLocked()

      return LoadResult(
        true,
        null,
        generation,
        track.url
      )
    }

    playLocked()

    var retriedBare = false
    var seekPending = startMs > 0

    var deadline =
      System.currentTimeMillis() +
        VERIFY_WINDOW_MS

    var seen: State? = null

    while (
      System.currentTimeMillis() <
      deadline
    ) {

      delay(VERIFY_STEP_MS)

      val state =
        stateLocked()
          ?: continue

      seen = state

      if (
        state.transportStatus.equals(
          "ERROR_OCCURRED",
          ignoreCase = true
        )
      ) {

        return LoadResult(
          false,
          "error",
          generation,
          state.trackUri
        )
      }

      val holdsPrevious =
        previousUri != null &&
          state.trackUri.isNotEmpty() &&
          StreamUri.same(
            state.trackUri,
            previousUri
          ) &&
          !StreamUri.same(
            state.trackUri,
            track.url
          )

      if (
        holdsPrevious &&
        state.playbackState == "PLAYING"
      ) {

        if (retriedBare) {
          return LoadResult(
            false,
            "ignored",
            generation,
            state.trackUri
          )
        }

        Log.w(
          Soap.TAG,
          "renderer kept previous track; retrying bare URI"
        )

        retriedBare = true

        stopBeforeHandover(
          avTransport
            ?: return LoadResult(
              false,
              "ignored",
              generation,
              state.trackUri
            )
        )

        val currentControl =
          avTransport
            ?: return LoadResult(
              false,
              "ignored",
              generation,
              state.trackUri
            )

        if (
          !setUri(
            currentControl,
            track,
            withMetadata = false
          ).ok
        ) {

          return LoadResult(
            false,
            "refused",
            generation,
            state.trackUri
          )
        }

        playLocked()

        deadline =
          System.currentTimeMillis() +
            VERIFY_WINDOW_MS

        continue
      }

      if (
        state.playbackState == "PLAYING"
      ) {

        if (seekPending) {
          seekPending =
            !seekLocked(startMs)
        }

        if (!seekPending) {
          return LoadResult(
            true,
            null,
            generation,
            state.trackUri
          )
        }
      }
    }

    if (seekPending) {
      seekLocked(startMs)
    }

    return LoadResult(
      true,
      null,
      generation,
      seen?.trackUri ?: ""
    )
  }

  suspend fun play(
    resumeAtMs: Long = 0
  ): TransportResult =
    mutex.withLock {

      if (!playLocked()) {
        return TransportResult(false)
      }

      if (resumeAtMs > 0) {

        val deadline =
          System.currentTimeMillis() +
            VERIFY_WINDOW_MS

        while (
          System.currentTimeMillis() <
          deadline
        ) {

          delay(VERIFY_STEP_MS)

          if (
            stateLocked()
              ?.playbackState == "PLAYING"
          ) {
            break
          }
        }

        seekLocked(resumeAtMs)
      }

      TransportResult(true)
    }

  private suspend fun playLocked(): Boolean {

    val ok =
      transport(
        "Play",
        "<InstanceID>0</InstanceID>" +
          "<Speed>1</Speed>"
      )

    if (ok) {
      lastTransportState = "PLAYING"
    }

    return ok
  }

  suspend fun pause(): TransportResult =
    mutex.withLock {
      pauseLocked()
    }

  private suspend fun pauseLocked(): TransportResult {

    if (
      transport(
        "Pause",
        INSTANCE
      )
    ) {

      lastTransportState =
        "PAUSED_PLAYBACK"

      return TransportResult(true)
    }

    val stopped =
      transport(
        "Stop",
        INSTANCE
      )

    if (stopped) {
      lastTransportState =
        "STOPPED"
    }

    return TransportResult(
      stopped,
      stoppedInstead = stopped
    )
  }

  suspend fun stop(
    forEpoch: Int
  ): Boolean =
    mutex.withLock {

      if (forEpoch != epoch) {
        return false
      }

      val ok =
        transport(
          "Stop",
          INSTANCE
        )

      if (ok) {
        lastTransportState =
          "STOPPED"
      }

      ok
    }

  suspend fun seek(
    positionMs: Long
  ): TransportResult =
    mutex.withLock {
      TransportResult(
        seekLocked(positionMs)
      )
    }

  private suspend fun seekLocked(
    positionMs: Long
  ): Boolean =
    transport(
      "Seek",
      "<InstanceID>0</InstanceID>" +
        "<Unit>REL_TIME</Unit>" +
        "<Target>" +
        Didl.hms(
          (positionMs / 1000)
            .toInt()
        ) +
        "</Target>"
    )

  private suspend fun transport(
    action: String,
    arguments: String
  ): Boolean {

    val control =
      avTransport
        ?: refreshControlUrl()
        ?: return false

    return Soap.call(
      control,
      Services.AV_TRANSPORT,
      action,
      arguments
    ).ok
  }

  suspend fun setVolume(
    volume: Int
  ): Boolean {

    val control =
      renderingControl
        ?: return false

    return Soap.call(
      control,
      Services.RENDERING_CONTROL,
      "SetVolume",
      "<InstanceID>0</InstanceID>" +
        "<Channel>Master</Channel>" +
        "<DesiredVolume>" +
        volume.coerceIn(0, 100) +
        "</DesiredVolume>"
    ).ok
  }

  suspend fun volume(): Int? {

    val control =
      renderingControl
        ?: return null

    val result =
      Soap.call(
        control,
        Services.RENDERING_CONTROL,
        "GetVolume",
        "<InstanceID>0</InstanceID>" +
          "<Channel>Master</Channel>"
      )

    return Soap.argument(
      result.body,
      "CurrentVolume"
    )?.toIntOrNull()
  }

  suspend fun state(): State? =
    mutex.withLock {
      stateLocked()
    }

  private suspend fun stateLocked(): State? {

    val control =
      avTransport
        ?: refreshControlUrl()
        ?: return null

    val generation =
      activeGeneration

    val transport =
      Soap.call(
        control,
        Services.AV_TRANSPORT,
        "GetTransportInfo",
        INSTANCE,
        Soap.POLL_TIMEOUT_MS
      )

    val playbackState =
      Soap.argument(
        transport.body,
        "CurrentTransportState"
      ) ?: return null

    val position =
      Soap.call(
        control,
        Services.AV_TRANSPORT,
        "GetPositionInfo",
        INSTANCE,
        Soap.POLL_TIMEOUT_MS
      )

    lastTransportState =
      playbackState

    return State(
      playbackState =
        playbackState,

      transportStatus =
        Soap.argument(
          transport.body,
          "CurrentTransportStatus"
        ) ?: "OK",

      positionMs =
        Didl.parseDuration(
          Soap.argument(
            position.body,
            "RelTime"
          )
        ),

      durationMs =
        Didl.parseDuration(
          Soap.argument(
            position.body,
            "TrackDuration"
          )
        ),

      trackUri =
        Soap.argument(
          position.body,
          "TrackURI"
        ) ?: "",

      generation =
        generation
    )
  }

  private suspend fun refreshControlUrl(): String? {

    val fresh =
      Soap.fetch(location)
        ?.let {
          DeviceDescription.parse(
            it,
            location
          )
        }
        ?: return null

    description = fresh

    avTransport =
      fresh.controlUrl(
        Services.AV_TRANSPORT
      )

    return avTransport
  }

  private companion object {

    const val INSTANCE =
      "<InstanceID>0</InstanceID>"

    const val VERIFY_WINDOW_MS =
      2500L

    const val VERIFY_STEP_MS =
      300L

    val MIME_FAULTS =
      setOf(
        714,
        716
      )
  }
}