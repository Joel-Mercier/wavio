package expo.modules.upnpcast

import android.util.Log
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * A connected renderer: where to send its commands, and how to get a track onto it.
 *
 * AVTransport:1 holds exactly one URI at a time and has no notion of a queue, so the
 * phone stays the brain — this only ever knows about the track playing right now.
 *
 * Every exchange with the device goes through one lock. A renderer answers questions
 * about whatever it holds *at that moment*, so a poll that started before a handover
 * and finished after it describes a track that no longer exists; the lock makes each
 * report wholly before or wholly after each command, and the generation stamped on
 * it says which.
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

  private val mutex = Mutex()

  /**
   * The load whose track the renderer currently holds, as numbered by the caller.
   * Read under the lock by every poll, so a report is stamped with the generation
   * that was current when it was taken.
   */
  @Volatile
  private var activeGeneration = 0.0

  /**
   * The newest load asked for, set the moment it is asked — before it has waited for
   * the lock. Two loads fired in quick succession can take the lock in either order;
   * this is how the older one knows to stand down instead of overwriting the newer.
   */
  @Volatile
  var latestRequested = 0.0

  /** Counts connections, so a stop sent for a session that has since been reopened is dropped. */
  @Volatile
  private var epoch = 0

  @Volatile
  private var lastUri: String? = null

  @Volatile
  private var lastTransportState: String? = null

  data class State(
    val playbackState: String,
    /** OK, or ERROR_OCCURRED when the renderer could not play what it was handed. */
    val transportStatus: String,
    val positionMs: Long,
    val durationMs: Long,
    /** What the renderer says it is holding — empty when it does not report one. */
    val trackUri: String,
    val generation: Double
  )

  data class LoadResult(
    val ok: Boolean,
    val reason: String?,
    val generation: Double,
    val trackUri: String
  )

  data class TransportResult(val ok: Boolean, val stoppedInstead: Boolean = false)

  fun connect(): Int {
    activeGeneration = 0.0
    latestRequested = 0.0
    lastUri = null
    lastTransportState = null
    return ++epoch
  }

  /**
   * Hands a track over and, unless told otherwise, starts it.
   *
   * Stop first: a renderer that is playing is, as often as not, unwilling to be
   * handed a new URI — some refuse, some say yes and carry on with the old one, and
   * a Play after that replays the old track from the top. Stopped, they all take it.
   *
   * The handover itself insists less each time it is refused (see [handover]).
   *
   * Then the renderer is asked what it actually holds, because "accepted" is a
   * promise some of them do not keep.
   */
  suspend fun load(track: Track, autoplay: Boolean, startMs: Long, generation: Double): LoadResult =
    mutex.withLock {
      if (generation < latestRequested) return superseded(generation)
      activeGeneration = generation
      val control = avTransport ?: refreshControlUrl() ?: return LoadResult(false, "unreachable", generation, "")

      stopBeforeHandover(control)
      var attempt = handover(control, track)

      if (!attempt.ok) {
        val coordinator = SonosTopology.coordinatorControlUrl(description)
        if (coordinator != null && coordinator != control) {
          // A different device: whatever the member said about itself says nothing
          // about what the coordinator is doing.
          stopBeforeHandover(coordinator, force = true)
          attempt = handover(coordinator, track)
          if (attempt.ok) avTransport = coordinator
        }
      }

      if (!attempt.ok) {
        // Whatever we cached about this device is worth nothing if it will not answer,
        // so the next attempt resolves it again from the description.
        avTransport = null
        return LoadResult(false, if (attempt.fault == null) "unreachable" else "refused", generation, "")
      }

      val previousUri = lastUri
      lastUri = track.url
      startAfterHandover(track, autoplay, startMs, previousUri, generation)
    }

  private fun superseded(generation: Double) = LoadResult(false, "superseded", generation, "")

  private suspend fun stopBeforeHandover(control: String, force: Boolean = false) {
    val idle = lastTransportState == "STOPPED" || lastTransportState == "NO_MEDIA_PRESENT"
    if (idle && !force) return
    // Its answer is of no interest: a renderer with nothing to stop complains, and
    // is stopped all the same.
    Soap.call(control, Services.AV_TRANSPORT, "Stop", INSTANCE)
    lastTransportState = "STOPPED"
  }

  /**
   * SetAVTransportURI, insisting less each time the renderer says no.
   *
   * The metadata goes first, because it is the only thing saying this is audio. A
   * 714 or 716 is the renderer objecting to the declared type rather than to the
   * item: DLNA-strict devices check `protocolInfo` against the sink list they
   * advertise, and a MIME they do not list is refused even when the stream itself
   * would play — so the same metadata is offered again with the type left open,
   * which keeps the audio class and drops the claim. Whatever else is refused, a
   * bare URI is the last attempt: worse (some will then guess wrong about the type)
   * but better than silence.
   */
  private suspend fun handover(control: String, track: Track): Soap.Result {
    var attempt = setUri(control, track, withMetadata = true)
    if (attempt.refused && attempt.errorCode in MIME_FAULTS) {
      Log.w(Soap.TAG, "renderer refused ${track.mime} (${attempt.errorCode}); retrying with a wildcard type")
      attempt = setUri(control, track.copy(mime = "*"), withMetadata = true)
    }
    if (attempt.refused) {
      Log.w(Soap.TAG, "renderer refused the track's metadata; retrying with the URI alone")
      attempt = setUri(control, track, withMetadata = false)
    }
    return attempt
  }

  private suspend fun setUri(control: String, track: Track, withMetadata: Boolean): Soap.Result {
    val metadata = if (withMetadata) Soap.escape(Didl.forTrack(track)) else ""
    return Soap.call(
      control,
      Services.AV_TRANSPORT,
      "SetAVTransportURI",
      "<InstanceID>0</InstanceID>" +
        "<CurrentURI>${Soap.escape(track.url)}</CurrentURI>" +
        "<CurrentURIMetaData>$metadata</CurrentURIMetaData>"
    )
  }

  /**
   * Starts (or parks) what was just handed over, then watches the renderer settle.
   *
   * Renderers disagree about whether being handed a URI starts playback. Asking is
   * harmless on the ones that already started, and skipping it leaves the others
   * silent while the app believes they are playing.
   *
   * The watch is what tells an honest renderer from one that said yes and did
   * nothing: if it is still reporting the previous URI once it is playing, the
   * handover did not take. A renderer that reports no URI at all is trusted.
   */
  private suspend fun startAfterHandover(
    track: Track,
    autoplay: Boolean,
    startMs: Long,
    previousUri: String?,
    generation: Double
  ): LoadResult {
    if (!autoplay) {
      pauseLocked()
      return LoadResult(true, null, generation, track.url)
    }
    playLocked()

    var retriedBare = false
    var seekPending = startMs > 0
    var deadline = System.currentTimeMillis() + VERIFY_WINDOW_MS
    var seen: State? = null
    while (System.currentTimeMillis() < deadline) {
      delay(VERIFY_STEP_MS)
      val state = stateLocked() ?: continue
      seen = state
      if (state.transportStatus.equals("ERROR_OCCURRED", ignoreCase = true)) {
        return LoadResult(false, "error", generation, state.trackUri)
      }
      val holdsPrevious = previousUri != null && state.trackUri.isNotEmpty() &&
        StreamUri.same(state.trackUri, previousUri) && !StreamUri.same(state.trackUri, track.url)
      if (holdsPrevious && state.playbackState == "PLAYING") {
        if (retriedBare) return LoadResult(false, "ignored", generation, state.trackUri)
        // Said yes, kept the old track: once more without the metadata, which is
        // the part renderers most often choke on without admitting it.
        Log.w(Soap.TAG, "renderer kept the previous track after accepting the new one; retrying bare")
        retriedBare = true
        stopBeforeHandover(avTransport ?: return LoadResult(false, "ignored", generation, state.trackUri))
        if (!setUri(avTransport!!, track, withMetadata = false).ok) {
          return LoadResult(false, "refused", generation, state.trackUri)
        }
        playLocked()
        deadline = System.currentTimeMillis() + VERIFY_WINDOW_MS
        continue
      }
      if (state.playbackState == "PLAYING") {
        if (seekPending) seekPending = !seekLocked(startMs)
        if (!seekPending) return LoadResult(true, null, generation, state.trackUri)
      }
    }
    // Still transitioning, or never answered: the handover was accepted and nothing
    // contradicted it, which is all a slow renderer ever gives us.
    if (seekPending) seekLocked(startMs)
    return LoadResult(true, null, generation, seen?.trackUri ?: "")
  }

  /**
   * Starts playback and, when the renderer had been stopped rather than paused,
   * puts it back where the listener left it. A stopped renderer starts from the
   * top and reopens the stream on Play; a Seek that lands while it is still
   * opening is answered politely and dropped (Kodi), so the seek waits for the
   * renderer to say it is playing, as the handover does.
   */
  suspend fun play(resumeAtMs: Long = 0): TransportResult = mutex.withLock {
    if (!playLocked()) return TransportResult(false)
    if (resumeAtMs > 0) {
      val deadline = System.currentTimeMillis() + VERIFY_WINDOW_MS
      while (System.currentTimeMillis() < deadline) {
        delay(VERIFY_STEP_MS)
        if (stateLocked()?.playbackState == "PLAYING") break
      }
      seekLocked(resumeAtMs)
    }
    TransportResult(true)
  }

  private suspend fun playLocked(): Boolean {
    val ok = transport("Play", "<InstanceID>0</InstanceID><Speed>1</Speed>")
    if (ok) lastTransportState = "PLAYING"
    return ok
  }

  /**
   * Pause is optional in AVTransport:1 and some renderers only implement Stop.
   * Stopping loses the position; the caller is told so it can seek back on resume.
   */
  suspend fun pause(): TransportResult = mutex.withLock { pauseLocked() }

  private suspend fun pauseLocked(): TransportResult {
    if (transport("Pause", INSTANCE)) {
      lastTransportState = "PAUSED_PLAYBACK"
      return TransportResult(true)
    }
    val stopped = transport("Stop", INSTANCE)
    if (stopped) lastTransportState = "STOPPED"
    return TransportResult(stopped, stoppedInstead = stopped)
  }

  /** Stops the renderer, unless this session has been reopened since the stop was asked for. */
  suspend fun stop(forEpoch: Int): Boolean = mutex.withLock {
    if (forEpoch != epoch) return false
    val ok = transport("Stop", INSTANCE)
    if (ok) lastTransportState = "STOPPED"
    ok
  }

  suspend fun seek(positionMs: Long): TransportResult = mutex.withLock { TransportResult(seekLocked(positionMs)) }

  private suspend fun seekLocked(positionMs: Long): Boolean = transport(
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
  suspend fun state(): State? = mutex.withLock { stateLocked() }

  private suspend fun stateLocked(): State? {
    val control = avTransport ?: refreshControlUrl() ?: return null
    val generation = activeGeneration
    val transport = Soap.call(control, Services.AV_TRANSPORT, "GetTransportInfo", INSTANCE, Soap.POLL_TIMEOUT_MS)
    val playbackState = Soap.argument(transport.body, "CurrentTransportState") ?: return null
    val position = Soap.call(control, Services.AV_TRANSPORT, "GetPositionInfo", INSTANCE, Soap.POLL_TIMEOUT_MS)
    lastTransportState = playbackState
    return State(
      playbackState = playbackState,
      transportStatus = Soap.argument(transport.body, "CurrentTransportStatus") ?: "OK",
      positionMs = Didl.parseDuration(Soap.argument(position.body, "RelTime")),
      durationMs = Didl.parseDuration(Soap.argument(position.body, "TrackDuration")),
      trackUri = Soap.argument(position.body, "TrackURI") ?: "",
      generation = generation
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
    const val VERIFY_WINDOW_MS = 2500L
    const val VERIFY_STEP_MS = 300L
    /** 714 Illegal MIME-Type, 716 Resource not found: the type was the objection. */
    val MIME_FAULTS = setOf(714, 716)
  }
}
