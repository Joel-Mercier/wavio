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
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

class TrackInfo(
  /**
   * The real MIME type (audio/flac, audio/mpeg…). Required, not derived: our stream
   * URLs carry no file extension, and a renderer left to guess calls the track a
   * video, which speakers refuse.
   */
  @Field val mime: String = "audio/mpeg",
  @Field val title: String = "",
  @Field val artist: String? = null,
  @Field val album: String? = null,
  /** Only when it is an address the renderer itself can reach. */
  @Field val artworkUrl: String? = null,
  @Field val durationSec: Double? = null
) : Record

/**
 * UPnP/DLNA casting: finds renderers on the local network and drives playback over
 * AVTransport.
 *
 * UPnP's push mechanism (GENA) needs the phone to run an HTTP server for callbacks
 * and is unreliable across renderers, so state is polled instead — once a second for
 * as long as a session is open, delivered to JS as a "state" event.
 */
class UpnpCastModule : Module() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  @Volatile private var pollJob: Job? = null

  /**
   * What the searches turned up, so a device can be reconnected to by id. Concurrent
   * because a search resolves every device's description in parallel, and kept across
   * searches because SSDP is lossy — a device absent from one round is usually still
   * there.
   */
  private val known = ConcurrentHashMap<String, RendererSession>()
  @Volatile private var session: RendererSession? = null

  override fun definition() = ModuleDefinition {
    Name("UpnpCast")

    Events("state")

    OnDestroy {
      pollJob?.cancel()
      scope.cancel()
    }

    /**
     * Searches the network and resolves with the renderers found.
     *
     * A search reaches everything on the network, and most of what is on a home
     * network cannot play a note — a router speaks UPnP to open ports and has no
     * business in a list of speakers. So each answer is asked what it is, and only
     * those exposing an AVTransport service are offered.
     *
     * Silence is not a no: a device whose description could not be fetched in time
     * has said nothing about what it is, and is returned unverified rather than
     * hidden. Better a stray box in the list than a speaker missing from it.
     */
    AsyncFunction("search") { timeoutMs: Double, promise: Promise ->
      scope.launch {
        val found = Ssdp.discover(timeoutMs.toLong())
        // Concurrently: each description is a request to a different device, and one
        // slow to answer should not decide how long the whole list takes.
        val devices = found.map { (location, address) ->
          async {
            val description = Soap.fetch(location)?.let { DeviceDescription.parse(it, location) }
            if (description == null) {
              mapOf(
                "id" to address,
                "name" to address,
                "address" to address,
                "isTV" to false,
                "verified" to false
              )
            } else if (description.isRenderer) {
              val id = description.udn ?: address
              known[id] = RendererSession(id, address, location, description)
              mapOf(
                "id" to id,
                "name" to (description.friendlyName?.takeIf { it.isNotEmpty() } ?: address),
                "address" to address,
                "isTV" to description.isTv,
                "verified" to true
              )
            } else {
              null
            }
          }
        }.awaitAll().filterNotNull()
        promise.resolve(devices)
      }
    }

    AsyncFunction("connect") { deviceId: String, promise: Promise ->
      val target = known[deviceId]
      if (target == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      session = target
      startPolling()
      promise.resolve(true)
    }

    AsyncFunction("load") { url: String, track: TrackInfo, autoplay: Boolean, promise: Promise ->
      val current = session
      if (current == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      scope.launch {
        val ok = current.load(
          Track(
            url = url,
            mime = track.mime,
            title = track.title,
            artist = track.artist,
            album = track.album,
            artworkUrl = track.artworkUrl,
            durationSeconds = (track.durationSec ?: 0.0).toInt()
          ),
          autoplay
        )
        promise.resolve(ok)
      }
    }

    AsyncFunction("play") { promise: Promise ->
      scope.launch { promise.resolve(session?.play() ?: false) }
    }

    AsyncFunction("pause") { promise: Promise ->
      scope.launch { promise.resolve(session?.pause() ?: false) }
    }

    AsyncFunction("seek") { positionMs: Double, promise: Promise ->
      scope.launch { promise.resolve(session?.seek(positionMs.toLong()) ?: false) }
    }

    /** 0..100. */
    AsyncFunction("setVolume") { volume: Int, promise: Promise ->
      scope.launch { promise.resolve(session?.setVolume(volume) ?: false) }
    }

    AsyncFunction("getVolume") { promise: Promise ->
      scope.launch { promise.resolve(session?.volume()) }
    }

    AsyncFunction("disconnect") { promise: Promise ->
      val current = session
      pollJob?.cancel()
      pollJob = null
      session = null
      scope.launch {
        // Leaving a renderer playing after the user has taken the music back to the
        // phone means two things playing at once.
        current?.stop()
        promise.resolve(true)
      }
    }
  }

  private fun startPolling() {
    pollJob?.cancel()
    pollJob = scope.launch {
      while (isActive) {
        val state = session?.state()
        if (state != null) {
          sendEvent(
            "state",
            mapOf(
              "playbackState" to state.playbackState,
              "positionMs" to state.positionMs.toDouble(),
              "durationMs" to state.durationMs.toDouble()
            )
          )
        }
        delay(POLL_INTERVAL_MS)
      }
    }
  }

  private companion object {
    const val POLL_INTERVAL_MS = 1000L
  }
}
