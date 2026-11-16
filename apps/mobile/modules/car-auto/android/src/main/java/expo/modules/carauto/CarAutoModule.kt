package expo.modules.carauto

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.media3.common.PlaybackException
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.SessionError
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

@OptIn(UnstableApi::class)
class CarAutoModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val pendingDelays = HashMap<Int, Runnable>()

  override fun definition() = ModuleDefinition {
    Name("CarAuto")

    Events(
      "play",
      "playSearch",
      "transport",
      "carConnection",
      "delayElapsed",
      "childrenRequest",
      "searchRequest",
      "itemAction",
    )

    OnCreate {
      instance = this@CarAutoModule
      jsReady = false
      appContext.reactContext?.let {
        BrowseStore.loadFromDiskIfNeeded(it)
        CarLabels.load(it)
      }
    }

    OnDestroy {
      if (instance === this@CarAutoModule) instance = null
      jsReady = false
      syncTimerHold()
      mainHandler.post {
        pendingDelays.values.forEach(mainHandler::removeCallbacks)
        pendingDelays.clear()
      }
    }

    // Called once JS has registered its car listeners; anything the car did
    // while the runtime was booting is replayed here.
    Function("notifyReady") {
      markJsReady()
    }

    Function("isCarConnected") {
      carConnected
    }

    // Backs services/backgroundTimer.ts: RN timers stop once the Activity is
    // backgrounded, a main-thread Handler message still arrives.
    Function("postDelayed") { id: Int, delayMs: Double ->
      val runnable = Runnable {
        pendingDelays.remove(id)
        if (instance === this@CarAutoModule) {
          sendEvent("delayElapsed", mapOf("id" to id))
        }
      }
      mainHandler.post {
        pendingDelays.put(id, runnable)?.let(mainHandler::removeCallbacks)
        mainHandler.postDelayed(runnable, delayMs.toLong().coerceAtLeast(0L))
      }
    }

    Function("cancelDelayed") { id: Int ->
      mainHandler.post {
        pendingDelays.remove(id)?.let(mainHandler::removeCallbacks)
      }
    }

    Function("setVerbose") { enabled: Boolean ->
      CarAutoLog.verbose = enabled
    }

    // Answers a childrenRequest, or pushes fresher children for a parent the
    // host may be showing. Null means JS couldn't fetch it: the waiting browse
    // is released with what is stored, and the parent is asked for again the
    // next time the host opens it.
    Function("setChildren") { parentId: String, json: String? ->
      if (json == null) BrowseStore.invalidate(listOf(parentId))
      val changed = json != null && BrowseStore.put(parentId, json)
      CarAutoLog.d("setChildren $parentId stored=${json != null} changed=$changed")
      mainHandler.post {
        PendingRequests.releaseChildren(parentId)
        if (changed) notifyChildrenChanged(listOf(parentId))
      }
    }

    Function("invalidateChildren") { json: String? ->
      val ids = json?.let { raw ->
        runCatching {
          val array = JSONArray(raw)
          (0 until array.length()).map { array.getString(it) }
        }.getOrNull()
      }
      BrowseStore.invalidate(ids)
    }

    // The account changed: nothing stored may be shown again. The host is told
    // every parent changed, so an open list is asked for anew and waits on JS.
    Function("clearChildren") {
      notifyChildrenChanged(BrowseStore.clear())
    }

    Function("setSearchResults") { query: String, json: String? ->
      BrowseStore.putSearch(query, json)
      mainHandler.post {
        val waited = PendingRequests.hasPendingSearch(query)
        PendingRequests.releaseSearch(query)
        if (!waited) notifySearchChanged(query)
      }
    }

    Function("answerAction") { requestId: Int, json: String ->
      mainHandler.post { PendingRequests.answerAction(requestId, json) }
    }

    Function("setNowPlaying") { json: String? ->
      val np = json?.takeIf { it != "null" }?.let { runCatching { parseNowPlaying(JSONObject(it)) }.getOrNull() }
      CarPlaybackMirror.setNowPlaying(np)
      WavioCarBrowserService.activePlayer?.applyNowPlaying(np)
    }

    Function("setQueue") { json: String ->
      val o = runCatching { JSONObject(json) }.getOrNull() ?: return@Function Unit
      val arr = o.optJSONArray("tracks") ?: return@Function Unit
      val items = (0 until arr.length()).mapNotNull { i ->
        arr.optJSONObject(i)?.let { runCatching { parseNowPlaying(it) }.getOrNull() }
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
      val o = runCatching { JSONObject(json) }.getOrNull() ?: return@Function Unit
      val state = JsProxyPlayer.PlaybackState(
        playing = o.optBoolean("isPlaying", false),
        buffering = o.optBoolean("buffering", false),
        positionMs = o.optLong("positionMs", 0L),
        speed = o.optDouble("speed", 1.0).toFloat().takeIf { it > 0f } ?: 1f,
        shuffle = o.optBoolean("shuffle", false),
        repeatMode = CarPlaybackMirror.repeatModeOf(o.optString("repeatMode")),
      )
      CarPlaybackMirror.setPlaybackState(state)
      WavioCarBrowserService.activePlayer?.applyPlaybackState(state)
    }

    Function("setPlayerButtons") { json: String ->
      val o = runCatching { JSONObject(json) }.getOrNull() ?: return@Function Unit
      CarPlaybackMirror.setButtons(
        CarPlaybackMirror.Buttons(
          favorite = if (o.isNull("favorite")) null else o.optBoolean("favorite"),
          shuffle = o.optBoolean("shuffle", true),
          repeat = o.optBoolean("repeat", true),
          radio = o.optBoolean("radio", false),
          longForm = o.optBoolean("longForm", false),
        ),
      )
      mainHandler.post { WavioCarBrowserService.refreshMediaButtons() }
    }

    Function("setLabels") { json: String ->
      appContext.reactContext?.let { CarLabels.set(it, json) }
      mainHandler.post { WavioCarBrowserService.refreshMediaButtons() }
    }

    Function("setError") { json: String? ->
      val o = json?.let { runCatching { JSONObject(it) }.getOrNull() }
      val message = o?.optStringOrNull("message")
      if (o != null && o.optBoolean("transient", false) && message != null) {
        mainHandler.post {
          WavioCarBrowserService.activeSession?.sendError(
            SessionError(SessionError.ERROR_UNKNOWN, message),
          )
        }
        return@Function Unit
      }
      val error = if (o != null && message != null) {
        PlaybackException(message, null, playbackErrorCode(o.optString("code")))
      } else {
        null
      }
      val cleared = error == null && CarPlaybackMirror.error != null
      CarPlaybackMirror.setError(error)
      WavioCarBrowserService.activePlayer?.applyError(error)
      // media3 only republishes the platform playback state when an error is
      // set, never when it clears, so the car would keep showing it until some
      // other state change. Re-sending the buttons republishes it.
      if (cleared) mainHandler.post { WavioCarBrowserService.refreshMediaButtons() }
    }

    Function("setArtworkHeaders") { json: String ->
      CarArtworkProvider.setHeaders(json)
    }

    Function("clearArtworkCache") {
      CarArtworkProvider.clear()
    }
  }

  fun emitPlayEvent(mediaId: String) {
    sendEvent("play", mapOf("mediaId" to mediaId))
  }

  fun emitPlaySearch(query: Bundle) {
    sendEvent("playSearch", query)
  }

  fun emitTransport(action: String, value: Double?, stringValue: String?) {
    val payload = HashMap<String, Any>(2)
    payload["action"] = action
    when {
      stringValue != null -> payload["value"] = stringValue
      value != null -> payload["value"] = value
    }
    sendEvent("transport", payload)
  }

  companion object {
    @Volatile var instance: CarAutoModule? = null
      private set

    @Volatile var jsReady: Boolean = false
      private set

    private const val PENDING_TTL_MS = 60_000L

    private sealed class Pending(val atMs: Long) {
      class Play(val mediaId: String, atMs: Long) : Pending(atMs)
      class Search(val query: Bundle, atMs: Long) : Pending(atMs)
      class Transport(val action: String, val value: Double?, val stringValue: String?, atMs: Long) : Pending(atMs)
    }

    private var pendingPlay: Pending? = null
    private val pendingChildren = LinkedHashSet<String>()
    private val pendingSearches = LinkedHashSet<String>()

    @Volatile var carConnected: Boolean = false
      private set

    fun setCarConnected(connected: Boolean) {
      if (carConnected == connected) return
      carConnected = connected
      CarAutoLog.d("car connected=$connected")
      if (connected) BrowseStore.invalidate(null)
      instance?.sendEvent("carConnection", mapOf("connected" to connected))
      syncTimerHold()
    }

    private fun syncTimerHold() {
      CarTimerHold.update {
        val context = instance?.let { it.appContext.reactContext }
        CarAutoLog.d("timer hold: car=$carConnected ready=$jsReady context=${context != null}")
        if (carConnected && jsReady) context else null
      }
    }

    // Deciding "deliver or park" and flipping jsReady are one atomic step: car
    // intents arrive on binder threads, notifyReady on the JS thread.
    private val gate = Any()

    private fun readyModule(): CarAutoModule? = instance?.takeIf { jsReady }

    /** Returns false when parked, i.e. the caller should boot the runtime. */
    fun deliverPlay(mediaId: String): Boolean = synchronized(gate) {
      readyModule()?.let {
        it.emitPlayEvent(mediaId)
        return@synchronized true
      }
      pendingPlay = Pending.Play(mediaId, SystemClock.elapsedRealtime())
      false
    }

    fun deliverPlaySearch(query: Bundle): Boolean = synchronized(gate) {
      readyModule()?.let {
        it.emitPlaySearch(query)
        return@synchronized true
      }
      pendingPlay = Pending.Search(query, SystemClock.elapsedRealtime())
      false
    }

    // Only play / next / previous are parked: they still mean something
    // against the queue JS restores on boot. A parked tap always wins.
    fun deliverTransport(
      action: String,
      value: Double? = null,
      stringValue: String? = null,
      parkWhenCold: Boolean = false,
    ): Boolean = synchronized(gate) {
      readyModule()?.let {
        it.emitTransport(action, value, stringValue)
        return@synchronized true
      }
      if (parkWhenCold && pendingPlay !is Pending.Play && pendingPlay !is Pending.Search) {
        pendingPlay = Pending.Transport(action, value, stringValue, SystemClock.elapsedRealtime())
      }
      false
    }

    fun deliverChildrenRequest(parentId: String) = synchronized(gate) {
      val module = readyModule()
      if (module != null) {
        module.sendEvent("childrenRequest", mapOf("parentId" to parentId))
      } else {
        pendingChildren.add(parentId)
      }
    }

    fun deliverSearchRequest(query: String) = synchronized(gate) {
      val module = readyModule()
      if (module != null) {
        module.sendEvent("searchRequest", mapOf("query" to query))
      } else {
        pendingSearches.add(query)
      }
    }

    fun deliverItemAction(requestId: Int, action: String, mediaId: String): Boolean =
      synchronized(gate) {
        val module = readyModule() ?: return@synchronized false
        module.sendEvent(
          "itemAction",
          mapOf("requestId" to requestId, "action" to action, "mediaId" to mediaId),
        )
        true
      }

    fun markJsReady() {
      synchronized(gate) {
        jsReady = true
        syncTimerHold()
        val module = instance ?: return
        pendingChildren.forEach { module.sendEvent("childrenRequest", mapOf("parentId" to it)) }
        pendingChildren.clear()
        pendingSearches.forEach { module.sendEvent("searchRequest", mapOf("query" to it)) }
        pendingSearches.clear()
        val pending = pendingPlay ?: return
        pendingPlay = null
        if (SystemClock.elapsedRealtime() - pending.atMs > PENDING_TTL_MS) return
        CarAutoLog.d("flushing parked ${pending::class.simpleName}")
        when (pending) {
          is Pending.Play -> module.emitPlayEvent(pending.mediaId)
          is Pending.Search -> module.emitPlaySearch(pending.query)
          is Pending.Transport -> module.emitTransport(pending.action, pending.value, pending.stringValue)
        }
      }
    }

    fun notifyChildrenChanged(parentIds: List<String>) {
      val post = {
        val session = WavioCarBrowserService.activeSession
        if (session != null) {
          for (parentId in parentIds) {
            runCatching { session.notifyChildrenChanged(parentId, BrowseStore.childCount(parentId), null) }
              .onFailure { CarAutoLog.w("notify failed for $parentId", it) }
          }
        }
      }
      if (Looper.myLooper() == Looper.getMainLooper()) post() else Handler(Looper.getMainLooper()).post(post)
    }

    private fun notifySearchChanged(query: String) {
      val session = WavioCarBrowserService.activeSession ?: return
      val count = BrowseStore.getSearch(query)?.size ?: 0
      for (controller in session.connectedControllers) {
        runCatching { session.notifySearchResultChanged(controller, query, count, null) }
      }
    }

    private fun playbackErrorCode(code: String): Int = when (code) {
      "authentication" -> PlaybackException.ERROR_CODE_AUTHENTICATION_EXPIRED
      "network" -> PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED
      "setup" -> PlaybackException.ERROR_CODE_SETUP_REQUIRED
      else -> PlaybackException.ERROR_CODE_UNSPECIFIED
    }
  }
}

@OptIn(UnstableApi::class)
private fun parseNowPlaying(o: JSONObject): JsProxyPlayer.NowPlaying =
  JsProxyPlayer.NowPlaying(
    id = o.optString("id"),
    title = o.optStringOrNull("title"),
    artist = o.optStringOrNull("artist"),
    album = o.optStringOrNull("album"),
    artworkUrl = o.optStringOrNull("artworkUrl"),
    durationMs = o.optLong("durationMs", 0L),
    artistMediaId = o.optStringOrNull("artistMediaId"),
    explicit = o.optBoolean("explicit", false),
    downloaded = o.optBoolean("downloaded", false),
  )
