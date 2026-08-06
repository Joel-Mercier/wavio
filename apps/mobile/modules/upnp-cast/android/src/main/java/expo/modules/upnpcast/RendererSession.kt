package expo.modules.upnpcast

import android.util.Log

/**
 * A connected renderer: where to send its commands, and how to get a track onto it.
 *
 * AVTransport:1 holds exactly one URI at a time and has no notion of a queue, so the
 * phone stays the brain — this only ever knows about the track playing right now.
 */
class RendererSession(
  val deviceId: String,
  val address: String,
  val location: String,
  initialDescription: DeviceDescription
) {
  @Volatile
  private var description: DeviceDescription = initialDescription

  /**
   * Resolved once and reused. On a Sonos group member this is quietly replaced by
   * the coordinator's, which is where every later command has to go too — including
   * the transport controls and the state polling, not just the handover.
   */
  @Volatile
  private var avTransport: String? = initialDescription.controlUrl(Services.AV_TRANSPORT)

  private val renderingControl: String? =
    initialDescription.controlUrl(Services.RENDERING_CONTROL)

  data class State(val playbackState: String, val positionMs: Long, val durationMs: Long)

  /**
   * Hands a track over and, unless told otherwise, starts it.
   *
   * The metadata goes first every time, because it is the only thing saying this is
   * audio. Renderers that dislike something in it refuse the whole call, so a bare
   * URI is the second attempt: worse (some will then guess wrong about the type) but
   * better than silence.
   */
  suspend fun load(track: Track, autoplay: Boolean): Boolean {
    val control = avTransport ?: refreshControlUrl() ?: return false

    var accepted = setUri(control, track, withMetadata = true)
    if (!accepted) accepted = setUri(control, track, withMetadata = false)

    if (!accepted) {
      val coordinator = SonosTopology.coordinatorControlUrl(description)
      if (coordinator != null && coordinator != control) {
        accepted = setUri(coordinator, track, withMetadata = true) ||
          setUri(coordinator, track, withMetadata = false)
        if (accepted) avTransport = coordinator
      }
    }

    if (!accepted) {
      // Whatever we cached about this device is worth nothing if it will not answer,
      // so the next attempt resolves it again from the description.
      avTransport = null
      return false
    }

    // Renderers disagree about whether being handed a URI starts playback. Asking is
    // harmless on the ones that already started, and skipping it leaves the others
    // silent while the app believes they are playing.
    if (autoplay) play() else pause()
    return true
  }

  private suspend fun setUri(control: String, track: Track, withMetadata: Boolean): Boolean {
    val metadata = if (withMetadata) Soap.escape(Didl.forTrack(track)) else ""
    val result = Soap.call(
      control,
      Services.AV_TRANSPORT,
      "SetAVTransportURI",
      "<InstanceID>0</InstanceID>" +
        "<CurrentURI>${Soap.escape(track.url)}</CurrentURI>" +
        "<CurrentURIMetaData>$metadata</CurrentURIMetaData>"
    )
    if (!result.ok && withMetadata) {
      Log.w(Soap.TAG, "renderer refused the track's metadata; retrying with the URI alone")
    }
    return result.ok
  }

  suspend fun play(): Boolean = transport("Play", "<InstanceID>0</InstanceID><Speed>1</Speed>")

  suspend fun pause(): Boolean {
    // Pause is optional in AVTransport:1 and some renderers only implement Stop.
    // Stopping loses the position, but the app tracks that itself and seeks back.
    if (transport("Pause", "<InstanceID>0</InstanceID>")) return true
    return transport("Stop", "<InstanceID>0</InstanceID>")
  }

  suspend fun stop(): Boolean = transport("Stop", "<InstanceID>0</InstanceID>")

  suspend fun seek(positionMs: Long): Boolean = transport(
    "Seek",
    "<InstanceID>0</InstanceID><Unit>REL_TIME</Unit>" +
      "<Target>${Didl.hms((positionMs / 1000).toInt())}</Target>"
  )

  private suspend fun transport(action: String, arguments: String): Boolean {
    val control = avTransport ?: refreshControlUrl() ?: return false
    return Soap.call(control, Services.AV_TRANSPORT, action, arguments).ok
  }

  /** 0..100, the range UPnP uses. */
  suspend fun setVolume(volume: Int): Boolean {
    val control = renderingControl ?: return false
    return Soap.call(
      control,
      Services.RENDERING_CONTROL,
      "SetVolume",
      "<InstanceID>0</InstanceID><Channel>Master</Channel>" +
        "<DesiredVolume>${volume.coerceIn(0, 100)}</DesiredVolume>"
    ).ok
  }

  suspend fun volume(): Int? {
    val control = renderingControl ?: return null
    val result = Soap.call(
      control,
      Services.RENDERING_CONTROL,
      "GetVolume",
      "<InstanceID>0</InstanceID><Channel>Master</Channel>"
    )
    return Soap.argument(result.body, "CurrentVolume")?.toIntOrNull()
  }

  /**
   * Where the renderer is now.
   *
   * Two calls because UPnP splits them: the state is in AVTransport's transport info
   * and the position is in its position info. Returns null when the device stops
   * answering at all, which the caller treats as the session being gone rather than
   * as a state.
   */
  suspend fun state(): State? {
    val control = avTransport ?: return null
    val transport = Soap.call(control, Services.AV_TRANSPORT, "GetTransportInfo", INSTANCE)
    val playbackState = Soap.argument(transport.body, "CurrentTransportState") ?: return null
    val position = Soap.call(control, Services.AV_TRANSPORT, "GetPositionInfo", INSTANCE)
    return State(
      playbackState = playbackState,
      positionMs = Didl.parseDuration(Soap.argument(position.body, "RelTime")),
      durationMs = Didl.parseDuration(Soap.argument(position.body, "TrackDuration"))
    )
  }

  private suspend fun refreshControlUrl(): String? {
    val fresh = Soap.fetch(location)?.let { DeviceDescription.parse(it, location) } ?: return null
    description = fresh
    avTransport = fresh.controlUrl(Services.AV_TRANSPORT)
    return avTransport
  }

  private companion object {
    const val INSTANCE = "<InstanceID>0</InstanceID>"
  }
}
