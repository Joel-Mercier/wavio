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
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import java.io.Closeable
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue

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
 * and is unreliable across renderers, so state is polled instead — once a second
 * while something plays, every other second while nothing does — delivered to JS as
 * a "state" event. A renderer that stops answering altogether is reported once as
 * "lost", and the polling stops with it.
 */
class UpnpCastModule : Module() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  @Volatile private var pollJob: Job? = null
  @Volatile private var sessionEpoch = 0
  @Volatile private var listener: Closeable? = null
  /** Description fetches in progress, so a device answering twice is asked once. */
  private val describing = ConcurrentHashMap.newKeySet<String>()
  /** Description URL -> when it was last resolved from an announcement. */
  private val announced = ConcurrentHashMap<String, Long>()

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

    Events("device", "state", "lost")

    OnDestroy {
      pollJob?.cancel()
      listener?.close()
      scope.cancel()
    }

    /**
     * Searches the network, handing over each renderer as it is found — as a
     * "device" event — and resolving with all of them once the search is over.
     *
     * A search reaches everything on the network, and most of what is on a home
     * network cannot play a note — a router speaks UPnP to open ports and has no
     * business in a list of speakers. So each answer is asked what it is, and only
     * those exposing an AVTransport service are offered. One whose description
     * cannot be fetched is not offered at all: without it there is nowhere to send
     * a command, so a row for it could never work.
     */
    AsyncFunction("search") { timeoutMs: Double, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(emptyList<Map<String, Any>>())
        return@AsyncFunction
      }
      scope.launch {
        val found = ConcurrentHashMap<String, Map<String, Any>>()
        // Answers come in from one coroutine per network at once.
        val fetches = ConcurrentLinkedQueue<Job>()
        Ssdp.discover(context, timeoutMs.toLong()) { reply ->
          // Concurrently: each description is a request to a different device, and
          // one slow to answer should not decide how long the whole list takes.
          fetches += launch {
            resolveDevice(reply.location, reply.address)?.let { device ->
              found[device["id"] as String] = device
              sendEvent("device", device)
            }
          }
        }
        fetches.joinAll()
        promise.resolve(found.values.toList())
      }
    }

    /**
     * Listens for renderers announcing themselves, for as long as the output picker
     * is open, reporting each as a "device" event. Catches the ones that never
     * answer a search but say hello on their own.
     */
    AsyncFunction("startListening") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null || listener != null) {
        promise.resolve(listener != null)
        return@AsyncFunction
      }
      listener = Ssdp.listen(context, scope) { reply ->
        // A device announces each of its types in a burst, one packet apiece, and
        // they all point at the same description; one fetch per burst is enough.
        val now = System.currentTimeMillis()
        val last = announced.put(reply.location, now)
        if (last != null && now - last < ANNOUNCE_DEDUPE_MS) return@listen
        resolveDevice(reply.location, reply.address)?.let { sendEvent("device", it) }
      }
      promise.resolve(true)
    }

    AsyncFunction("stopListening") { promise: Promise ->
      listener?.close()
      listener = null
      promise.resolve(null)
    }

    /**
     * Re-learns a renderer from the description URL a previous session saved, so a
     * restart can find it again without a multicast search. Only registers it as
     * known: nothing is sent to the device beyond the description fetch, because at
     * this point it may well be playing someone else's music.
     *
     * Whatever answers at that address must still identify as the same device: after
     * a DHCP reshuffle a twin of the same model can sit there, and it is not ours.
     */
    AsyncFunction("describe") { deviceId: String, location: String, promise: Promise ->
      scope.launch {
        val description = Soap.fetch(location)?.let { DeviceDescription.parse(it, location) }
        if (description == null || !description.isRenderer) {
          promise.resolve(null)
          return@launch
        }
        val address = URL(location).host
        if ((description.udn ?: address) != deviceId) {
          promise.resolve(null)
          return@launch
        }
        known[deviceId] = RendererSession(deviceId, address, location, description)
        promise.resolve(deviceMap(deviceId, address, location, description))
      }
    }

    /** Asks a known renderer what it is doing, without becoming its controller. */
    AsyncFunction("probe") { deviceId: String, promise: Promise ->
      val target = known[deviceId]
      if (target == null) {
        promise.resolve(null)
        return@AsyncFunction
      }
      scope.launch { promise.resolve(target.state()?.let { stateMap(it) }) }
    }

    /**
     * Makes a known renderer the output — after asking it one question first. A
     * device is known from a search or a probe that may be minutes old, and a TV
     * that has since gone to standby stays in the list looking perfectly
     * selectable; one that will not even say what it is doing is not connected
     * to, so the failure is "can't reach it" and not a track it never received.
     */
    AsyncFunction("connect") { deviceId: String, promise: Promise ->
      val target = known[deviceId]
      if (target == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      scope.launch {
        if (target.state() == null) {
          promise.resolve(false)
          return@launch
        }
        sessionEpoch = target.connect()
        // A grouped Sonos speaker plays whatever its group plays, so playing to it
        // means playing to the group — through its coordinator, from the start.
        if (target.description.isSonos) target.followCoordinator()
        session = target
        startPolling()
        promise.resolve(true)
      }
    }

    /**
     * Hands a track to the connected renderer.
     *
     * `generation` numbers the caller's loads. It is recorded here, on the module's
     * serial call thread, before the work is scheduled: two loads fired back to back
     * are then ordered by the caller's intent rather than by which coroutine happens
     * to run first, and the older one stands down rather than overwriting the newer.
     */
    AsyncFunction("load") { url: String, track: TrackInfo, autoplay: Boolean, startPositionMs: Double, generation: Double, promise: Promise ->
      val current = session
      if (current == null) {
        promise.resolve(loadResultMap(RendererSession.LoadResult(false, "no_session", generation, "")))
        return@AsyncFunction
      }
      current.latestRequested = maxOf(current.latestRequested, generation)
      scope.launch {
        val result = current.load(
          Track(
            url = url,
            mime = track.mime,
            title = track.title,
            artist = track.artist,
            album = track.album,
            artworkUrl = track.artworkUrl,
            durationSeconds = (track.durationSec ?: 0.0).toInt()
          ),
          autoplay,
          startPositionMs.toLong(),
          generation
        )
        promise.resolve(loadResultMap(result))
      }
    }

    AsyncFunction("play") { resumeAtMs: Double, promise: Promise ->
      scope.launch { promise.resolve(session?.play(resumeAtMs.toLong())?.ok ?: false) }
    }

    AsyncFunction("pause") { promise: Promise ->
      scope.launch {
        val result = session?.pause() ?: RendererSession.TransportResult(false)
        promise.resolve(mapOf("ok" to result.ok, "stoppedInstead" to result.stoppedInstead))
      }
    }

    AsyncFunction("seek") { positionMs: Double, promise: Promise ->
      scope.launch { promise.resolve(session?.seek(positionMs.toLong())?.ok ?: false) }
    }

    /** One poll now, outside the schedule — for when the app comes back to the foreground. */
    AsyncFunction("pollNow") { promise: Promise ->
      scope.launch {
        val current = session
        if (current != null) current.state()?.let { sendEvent("state", stateMap(it)) }
        promise.resolve(null)
      }
    }

    /** 0..100. A Sonos group's as a whole, keeping its rooms' balance. */
    AsyncFunction("setVolume") { volume: Int, promise: Promise ->
      scope.launch { promise.resolve(session?.setOutputVolume(volume) ?: false) }
    }

    AsyncFunction("getVolume") { promise: Promise ->
      scope.launch { promise.resolve(session?.outputVolume()) }
    }

    /**
     * The Sonos group the connected speaker plays in, and the other rooms of its
     * household that could join it. Null for anything that is not a Sonos.
     *
     * Asked fresh, and each member's volume with it: this is read when someone is
     * about to change the group, never on a schedule.
     */
    AsyncFunction("groupState") { promise: Promise ->
      val current = session
      if (current == null || !current.description.isSonos) {
        promise.resolve(null)
        return@AsyncFunction
      }
      scope.launch {
        val topology = SonosTopology.read(current.description, fresh = true)
        val group = topology?.groupOf(current.deviceId)
        if (topology == null || group == null) {
          promise.resolve(null)
          return@launch
        }
        val members = group.visibleMembers.map { member ->
          async {
            mapOf(
              "id" to member.uuid,
              "name" to (member.zoneName ?: member.uuid),
              "volume" to sonosRoom(member.uuid)?.volume()
            )
          }
        }.awaitAll()
        val candidates = topology.groups.filter { it !== group }.flatMap { it.visibleMembers }.map {
          mapOf("id" to it.uuid, "name" to (it.zoneName ?: it.uuid))
        }
        promise.resolve(
          mapOf("coordinatorId" to group.coordinator, "members" to members, "candidates" to candidates)
        )
      }
    }

    /**
     * Brings another room of the household into the connected speaker's group. Sonos
     * keeps it in step from there; nothing is reloaded and the music does not stop.
     */
    AsyncFunction("addToGroup") { deviceId: String, promise: Promise ->
      val current = session
      if (current == null || deviceId == current.deviceId) {
        promise.resolve(false)
        return@AsyncFunction
      }
      scope.launch {
        val coordinator = SonosTopology.read(current.description, fresh = true)
          ?.groupOf(current.deviceId)?.coordinator
        val room = sonosRoom(deviceId)
        val ok = coordinator != null && room != null && room.joinGroup(coordinator)
        afterGroupChange(current)
        promise.resolve(ok)
      }
    }

    /**
     * Takes a room out of the group, leaving the rest playing. Never the connected
     * speaker itself: that is the output, and leaving it is a disconnect.
     */
    AsyncFunction("removeFromGroup") { deviceId: String, promise: Promise ->
      val current = session
      if (current == null || deviceId == current.deviceId) {
        promise.resolve(false)
        return@AsyncFunction
      }
      scope.launch {
        val ok = sonosRoom(deviceId)?.leaveGroup() ?: false
        afterGroupChange(current)
        promise.resolve(ok)
      }
    }

    /** One room's own volume, 0..100, leaving the rest of its group where they are. */
    AsyncFunction("setDeviceVolume") { deviceId: String, volume: Int, promise: Promise ->
      val current = session
      if (current == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      scope.launch {
        val ok = sonosRoom(deviceId)?.setVolume(volume) ?: false
        current.groupChanged()
        promise.resolve(ok)
      }
    }

    AsyncFunction("disconnect") { promise: Promise ->
      val current = session
      val epoch = sessionEpoch
      pollJob?.cancel()
      pollJob = null
      session = null
      // Leaving a renderer playing after the user has taken the music back to the
      // phone means two things playing at once. Not awaited: a renderer that has
      // gone quiet would otherwise hold up the phone taking playback back.
      scope.launch { current?.stop(epoch) }
      promise.resolve(true)
    }
  }

  /**
   * What answered at this description URL, if it is a renderer. Fetched twice
   * before giving up: a TV busy waking up answers the second time.
   */
  private suspend fun resolveDevice(location: String, address: String): Map<String, Any>? {
    if (!describing.add(location)) return null
    try {
      val xml = Soap.fetch(location) ?: Soap.fetch(location, Soap.SLOW_FETCH_TIMEOUT_MS) ?: return null
      val description = DeviceDescription.parse(xml, location) ?: return null
      if (!description.isRenderer) return null
      val id = description.udn ?: address
      // The hidden half of a stereo pair answers a search like any speaker, under
      // the same room name; offered, it is a duplicate row that plays half the music.
      if (SonosTopology.read(description)?.member(id)?.invisible == true) return null
      known[id] = RendererSession(id, address, location, description)
      return deviceMap(id, address, location, description)
    } finally {
      describing.remove(location)
    }
  }

  /**
   * A room of the connected speaker's household, as a session to send it commands
   * through. Found by search like any device, or learnt from where the household
   * says it is: a room can be in a group without ever having answered this phone.
   */
  private suspend fun sonosRoom(deviceId: String): RendererSession? {
    known[deviceId]?.let { return it }
    val anchor = session ?: return null
    val member = SonosTopology.read(anchor.description)?.member(deviceId) ?: return null
    val description = Soap.fetch(member.location)?.let { DeviceDescription.parse(it, member.location) }
    if (description == null || description.udn != deviceId || !description.isRenderer) return null
    return RendererSession(deviceId, URL(member.location).host, member.location, description)
      .also { known[deviceId] = it }
  }

  /**
   * After a room joins or leaves, the household has changed under every cached
   * answer — and when the room that left was the coordinator, the music went with
   * whoever took over, so the session goes there too.
   */
  private suspend fun afterGroupChange(current: RendererSession) {
    SonosTopology.invalidate()
    current.groupChanged()
    current.followCoordinator()
  }

  private fun startPolling() {
    pollJob?.cancel()
    pollJob = scope.launch {
      var silentSince = 0L
      var interval = POLL_INTERVAL_MS
      while (isActive) {
        val current = session ?: break
        val state = current.state()
        val now = System.currentTimeMillis()
        if (state?.regrouped == true) {
          // Taken over from the Sonos app. Dropped before the app hears of it, so
          // the disconnect that follows does not stop another group's music.
          session = null
          sendEvent("lost", mapOf("deviceId" to current.deviceId))
          break
        }
        if (state != null) {
          silentSince = 0L
          sendEvent("state", stateMap(state))
          interval = if (state.playbackState == "PLAYING" || state.playbackState == "TRANSITIONING") {
            POLL_INTERVAL_MS
          } else {
            IDLE_POLL_INTERVAL_MS
          }
        } else {
          if (silentSince == 0L) silentSince = now
          if (now - silentSince >= LOST_AFTER_MS) {
            sendEvent("lost", mapOf("deviceId" to current.deviceId))
            break
          }
        }
        delay(interval)
      }
    }
  }

  private fun loadResultMap(result: RendererSession.LoadResult): Map<String, Any?> = mapOf(
    "ok" to result.ok,
    "reason" to result.reason,
    "generation" to result.generation,
    "trackUri" to result.trackUri
  )

  private fun deviceMap(
    id: String,
    address: String,
    location: String,
    description: DeviceDescription
  ): Map<String, Any> = mapOf(
    "id" to id,
    "name" to (description.displayName ?: address),
    "address" to address,
    "location" to location,
    "isTV" to description.isTv,
    "isSonos" to description.isSonos
  )

  private fun stateMap(state: RendererSession.State): Map<String, Any> = mapOf(
    "playbackState" to state.playbackState,
    "transportStatus" to state.transportStatus,
    "positionMs" to state.positionMs.toDouble(),
    "durationMs" to state.durationMs.toDouble(),
    "trackUri" to state.trackUri,
    "generation" to state.generation
  )

  private companion object {
    const val POLL_INTERVAL_MS = 1000L
    const val IDLE_POLL_INTERVAL_MS = 2000L
    // Long enough to ride out a Wi-Fi hiccup, short enough that the user is not
    // staring at a dead seek bar wondering.
    const val LOST_AFTER_MS = 8000L
    const val ANNOUNCE_DEDUPE_MS = 5000L
  }
}
