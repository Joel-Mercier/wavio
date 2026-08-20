package expo.modules.carauto

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

@OptIn(UnstableApi::class)
class CarAutoModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("CarAuto")

    Events("play", "transport")

    OnCreate {
      instance = this@CarAutoModule
      jsReady = false
    }

    OnDestroy {
      if (instance === this@CarAutoModule) instance = null
      jsReady = false
    }

    // Called by services/carAuto/session.ts once its `play` / `transport`
    // listeners are registered. The module instance exists as soon as the React
    // context is created — a few hundred ms before the bundle finishes
    // evaluating — so events emitted in that window would land nowhere. Anything
    // the car did while JS was booting is replayed here.
    Function("notifyReady") {
      markJsReady()
    }

    Function("setVerbose") { enabled: Boolean ->
      CarAutoLog.verbose = enabled
    }

    Function("setNodes") { json: String ->
      val context = appContext.reactContext ?: return@Function
      val changed = BrowseTreeCache.setFromJson(context, json)
      CarAutoLog.d("setNodes ${BrowseTreeCache.debugSummary()} changed=${changed.size}")
      this@CarAutoModule.notifyChildrenChanged(changed)
    }

    // Every mirror push below records into CarPlaybackMirror *before* touching
    // the player, and keeps going when there is no player: the browser service
    // is only created once a car host binds it, so playback that started earlier
    // would otherwise never reach the session at all — see CarPlaybackMirror.
    Function("setNowPlaying") { json: String? ->
      val player = WavioCarBrowserService.activePlayer
      if (json.isNullOrEmpty() || json == "null") {
        CarPlaybackMirror.setNowPlaying(null)
        player?.applyNowPlaying(null)
        return@Function
      }
      val np = runCatching { parseNowPlaying(json) }.getOrNull() ?: return@Function
      CarPlaybackMirror.setNowPlaying(np)
      player?.applyNowPlaying(np)
    }

    Function("setQueue") { json: String ->
      val o = runCatching { JSONObject(json) }.getOrNull() ?: return@Function
      val arr = o.optJSONArray("tracks") ?: return@Function
      val items = ArrayList<JsProxyPlayer.NowPlaying>(arr.length())
      for (i in 0 until arr.length()) {
        val t = arr.optJSONObject(i) ?: continue
        items.add(
          JsProxyPlayer.NowPlaying(
            id = t.optString("id"),
            title = t.optString("title").takeIf { it.isNotEmpty() },
            artist = t.optString("artist").takeIf { it.isNotEmpty() },
            album = t.optString("album").takeIf { it.isNotEmpty() },
            artworkUrl = t.optString("artworkUrl").takeIf { it.isNotEmpty() },
            durationMs = t.optLong("durationMs", 0L),
          ),
        )
      }
      val index = o.optInt("currentIndex", 0)
      CarPlaybackMirror.setQueue(items, index)
      WavioCarBrowserService.activePlayer?.applyQueue(items, index)
    }

    Function("setQueueIndex") { index: Int ->
      CarPlaybackMirror.setQueueIndex(index)
      WavioCarBrowserService.activePlayer?.applyQueueIndex(index)
    }

    Function("setPlaybackState") { json: String ->
      val o = runCatching { JSONObject(json) }.getOrNull() ?: return@Function
      val isPlaying = o.optBoolean("isPlaying", false)
      val posMs = o.optLong("positionMs", 0L)
      val shuf = o.optBoolean("shuffle", false)
      val repeat = when (o.optString("repeatMode")) {
        "one" -> Player.REPEAT_MODE_ONE
        "all" -> Player.REPEAT_MODE_ALL
        else -> Player.REPEAT_MODE_OFF
      }
      CarPlaybackMirror.setPlaybackState(isPlaying, posMs, shuf, repeat)
      WavioCarBrowserService.activePlayer?.applyPlaybackState(isPlaying, posMs, shuf, repeat)
    }
  }

  /**
   * Tell subscribed browsers to re-read the parents a freshly pushed tree
   * changed. Without this a new tree only reaches the car when the user
   * navigates somewhere — so the screen they are already looking at (very much
   * including the top-level list a cold session opens on) keeps rendering the
   * children it fetched before JS had even built the tree, artwork and all.
   *
   * media3 requires session calls on the application thread; `setNodes` arrives
   * on the JS thread. Same hop as JsProxyPlayer's `runOnMain`.
   */
  private fun notifyChildrenChanged(changed: Map<String, Int>) {
    if (changed.isEmpty()) return
    val post = {
      val session = WavioCarBrowserService.activeSession
      if (session == null) {
        CarAutoLog.d("notify skipped: no session (${changed.size} parents)")
      } else {
        val browsers = session.connectedControllers.size
        CarAutoLog.d("notify ${changed.size} parents, $browsers controller(s)")
        for ((parentId, count) in changed) {
          runCatching { session.notifyChildrenChanged(parentId, count, null) }
            .onFailure { CarAutoLog.w("notify failed for $parentId", it) }
        }
      }
    }
    if (Looper.myLooper() == Looper.getMainLooper()) post() else mainHandler.post(post)
  }

  fun emitPlayEvent(mediaId: String, parentId: String? = null) {
    val payload = HashMap<String, Any>(2)
    payload["mediaId"] = mediaId
    if (parentId != null) payload["parentId"] = parentId
    sendEvent("play", payload)
  }

  fun emitTransport(action: String, value: Double?) {
    val payload = HashMap<String, Any>(2)
    payload["action"] = action
    if (value != null) payload["value"] = value
    sendEvent("transport", payload)
  }

  fun emitTransportString(action: String, value: String) {
    sendEvent("transport", mapOf("action" to action, "value" to value))
  }

  companion object {
    @Volatile var instance: CarAutoModule? = null
      private set

    // Whether JS has registered its car listeners. `instance != null` is not
    // enough — see the `notifyReady` comment above.
    @Volatile var jsReady: Boolean = false
      private set

    // A tap that arrived while the runtime was still booting is replayed on
    // notifyReady, but only for as long as it plausibly reflects what the user
    // still wants to hear.
    private const val PENDING_TTL_MS = 60_000L

    private data class PendingPlay(
      val mediaId: String,
      val parentId: String?,
      val atMs: Long,
    )

    private data class PendingTransport(
      val action: String,
      val value: Double?,
      val stringValue: String?,
      val atMs: Long,
    )

    private var pendingPlay: PendingPlay? = null
    private var pendingTransport: PendingTransport? = null

    // Deciding "deliver or park" and flipping jsReady have to be one atomic step.
    // They run on different threads — car intents arrive on a binder thread,
    // notifyReady on the JS thread — and interleaved they lose the intent: the
    // binder side reads jsReady == false, JS then flips it and finds nothing
    // pending, and the binder side parks a tap that nothing will ever flush.
    private val gate = Any()

    // Hands the car's tap to JS, or parks it for notifyReady to replay.
    // Returns false when it was parked, i.e. the caller should boot the runtime.
    fun deliverPlay(mediaId: String, parentId: String?): Boolean = synchronized(gate) {
      val module = instance
      if (module != null && jsReady) {
        module.emitPlayEvent(mediaId, parentId)
        return@synchronized true
      }
      pendingPlay = PendingPlay(mediaId, parentId, SystemClock.elapsedRealtime())
      // A newer tap supersedes a bare transport command.
      pendingTransport = null
      false
    }

    // Same for transport commands. `parkWhenCold` is for the ones that still
    // mean something against the queue JS restores on boot (play, next,
    // previous); a seek or a shuffle toggle targets state the cold process
    // doesn't have yet and is dropped instead.
    fun deliverTransport(
      action: String,
      value: Double? = null,
      stringValue: String? = null,
      parkWhenCold: Boolean = false,
    ): Boolean = synchronized(gate) {
      val module = instance
      if (module != null && jsReady) {
        if (stringValue != null) {
          module.emitTransportString(action, stringValue)
        } else {
          module.emitTransport(action, value)
        }
        return@synchronized true
      }
      // Never let a transport command override a parked tap: the tap carries
      // what to play, "play" only says to start whatever is loaded.
      if (parkWhenCold && pendingPlay == null) {
        pendingTransport =
          PendingTransport(action, value, stringValue, SystemClock.elapsedRealtime())
      }
      false
    }

    fun markJsReady() {
      synchronized(gate) {
        jsReady = true
        val module = instance ?: return
        val play = takePendingPlay()
        if (play != null) {
          CarAutoLog.d("flushing pending play ${play.mediaId}")
          module.emitPlayEvent(play.mediaId, play.parentId)
          return
        }
        val transport = takePendingTransport() ?: return
        CarAutoLog.d("flushing pending transport ${transport.action}")
        if (transport.stringValue != null) {
          module.emitTransportString(transport.action, transport.stringValue)
        } else {
          module.emitTransport(transport.action, transport.value)
        }
      }
    }

    private fun takePendingPlay(): PendingPlay? {
      val p = pendingPlay ?: return null
      pendingPlay = null
      if (SystemClock.elapsedRealtime() - p.atMs > PENDING_TTL_MS) return null
      return p
    }

    private fun takePendingTransport(): PendingTransport? {
      val t = pendingTransport ?: return null
      pendingTransport = null
      if (SystemClock.elapsedRealtime() - t.atMs > PENDING_TTL_MS) return null
      return t
    }
  }
}

@OptIn(UnstableApi::class)
private fun parseNowPlaying(json: String): JsProxyPlayer.NowPlaying {
  val o = JSONObject(json)
  return JsProxyPlayer.NowPlaying(
    id = o.optString("id"),
    title = o.optString("title").takeIf { it.isNotEmpty() },
    artist = o.optString("artist").takeIf { it.isNotEmpty() },
    album = o.optString("album").takeIf { it.isNotEmpty() },
    artworkUrl = o.optString("artworkUrl").takeIf { it.isNotEmpty() },
    durationMs = o.optLong("durationMs", 0L),
  )
}
