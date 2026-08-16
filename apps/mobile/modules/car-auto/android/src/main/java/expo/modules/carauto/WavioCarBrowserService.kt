package expo.modules.carauto

import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaConstants
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Standalone MediaLibraryService that exposes the JS-built BrowseTree to
 * Android Auto. The session's player is a `JsProxyPlayer` whose state is
 * pushed from JS, so AA's mini-player + Now Playing screen mirror real
 * expo-audio playback. Tapping a browsable item routes through Media3's
 * normal browse flow; tapping a playable leaf forwards the mediaId (plus the
 * parent the user was browsing) to JS via `CarAutoModule.emitPlayEvent` so JS
 * can enqueue the whole collection and start playback at the tapped track.
 */
@OptIn(UnstableApi::class)
class WavioCarBrowserService : MediaLibraryService() {
  private var session: MediaLibrarySession? = null
  private var jsPlayer: JsProxyPlayer? = null

  override fun onCreate() {
    super.onCreate()
    BrowseTreeCache.loadFromDiskIfNeeded(applicationContext)
    val player = JsProxyPlayer(applicationContext).also {
      jsPlayer = it
      activePlayer = it
      // This service is created when a car host binds it, which is routinely
      // long after playback started — so the player is born empty while JS has
      // been mirroring all along. Seed it before the session reads it, or the
      // car gets a session with an empty timeline and media3 swallows every
      // transport command (issue #161; see CarPlaybackMirror).
      CarPlaybackMirror.seed(it)
    }
    session = MediaLibrarySession.Builder(this, player, LibraryCallback())
      .setId("WavioCarBrowserSession")
      .build()
      .also { activeSession = it }
    CarAutoLog.d("browser service created")
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

  override fun onDestroy() {
    CarAutoLog.d("browser service destroyed")
    if (activePlayer === jsPlayer) activePlayer = null
    if (activeSession === session) activeSession = null
    session?.run { player.release(); release() }
    session = null
    jsPlayer = null
    super.onDestroy()
  }

  /**
   * Suppress this service's media notification entirely (no super call).
   *
   * The proxy owns no audio — expo-audio's `AudioControlsService` does, and it
   * already posts the real notification. Left to media3, seeding the player at
   * creation (see [CarPlaybackMirror]) makes this session look like it just
   * started playing, so it posts a *second* Wavio notification and tries to
   * `startForegroundService` from a service that was only ever bound, in the
   * background — the exact thing Android 12+ refuses. Android Auto never reads
   * the phone's notification, and gearhead's binding keeps the service alive
   * without the foreground promotion.
   */
  override fun onUpdateNotification(session: MediaSession, startInForegroundRequired: Boolean) {
    CarAutoLog.d("notification suppressed (foreground=$startInForegroundRequired)")
  }

  private inner class LibraryCallback : MediaLibrarySession.Callback {
    /**
     * Every player command a controller sends passes through here with the
     * caller attached — the only place that identifies *who* asked, since
     * `JsProxyPlayer`'s handlers see the command with no controller.
     *
     * Kept as tracing rather than policy: media3 itself never pauses a player
     * (verified against 1.4.1 and 1.9.0 — the only `pause()` call sites are the
     * controller paths), so anything that stops playback out of nowhere came in
     * through this hook and this is what names it.
     */
    override fun onPlayerCommandRequest(
      session: MediaSession,
      controller: MediaSession.ControllerInfo,
      playerCommand: Int,
    ): Int {
      CarAutoLog.d(
        "playerCommand ${playerCommandName(playerCommand)} by ${controller.packageName}" +
          " (v${controller.controllerVersion})",
      )
      return SessionResult.RESULT_SUCCESS
    }

    override fun onGetLibraryRoot(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<MediaItem>> {
      // A car host opening our browse tree is the earliest reliable signal that
      // the user is about to play something. Start the JS runtime now so it is
      // warm by the time they tap, instead of paying the boot on the tap itself.
      CarAutoLog.d("onGetLibraryRoot by ${browser.packageName}")
      if (browser.packageName in CAR_HOST_PACKAGES) {
        ReactHostBoot.ensureJsRuntime(applicationContext)
      }
      val rootExtras = Bundle().apply {
        // Hints to Android Auto: root children should be rendered as tabs
        // (category list items) and any inner browsable defaults to list.
        putInt(
          MediaConstants.EXTRAS_KEY_CONTENT_STYLE_BROWSABLE,
          MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_CATEGORY_LIST_ITEM,
        )
        putInt(
          MediaConstants.EXTRAS_KEY_CONTENT_STYLE_PLAYABLE,
          MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM,
        )
      }
      val root = MediaItem.Builder()
        .setMediaId(BrowseTreeCache.ROOT_ID)
        .setMediaMetadata(
          MediaMetadata.Builder()
            .setIsBrowsable(true)
            .setIsPlayable(false)
            .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
            .setExtras(rootExtras)
            .build(),
        )
        .build()
      return Futures.immediateFuture(LibraryResult.ofItem(root, params))
    }

    /**
     * Accept the browser's subscription and immediately tell it how many
     * children the parent has.
     *
     * `notifyChildrenChanged` only reaches browsers the session considers
     * subscribed, so this is the hook the whole "push a new tree and have the
     * open screen update" path hangs off. Answering here also covers the cold
     * case directly: the host subscribes to a parent we could only answer with
     * an empty list (JS hadn't built the tree yet), and the notify that follows
     * the first push is what fills it in.
     */
    override fun onSubscribe(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      parentId: String,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<Void>> {
      val count = BrowseTreeCache.childCount(parentId)
      CarAutoLog.d("onSubscribe $parentId count=$count by ${browser.packageName}")
      session.notifyChildrenChanged(browser, parentId, count, params)
      return Futures.immediateFuture(LibraryResult.ofVoid())
    }

    override fun onGetItem(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      mediaId: String,
    ): ListenableFuture<LibraryResult<MediaItem>> {
      val node = findNode(mediaId)
        ?: return Futures.immediateFuture(LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE))
      return Futures.immediateFuture(LibraryResult.ofItem(node.toMediaItem(), null))
    }

    override fun onGetChildren(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      parentId: String,
      page: Int,
      pageSize: Int,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
      // Honor the controller's paging window. Each browse MediaItem embeds its
      // (downscaled) local cover art as bytes, so returning a whole large list
      // in one shot could exceed the binder transaction limit. Slicing to the
      // requested page bounds each transaction; Android Auto pages through with
      // a sane pageSize, then stops when a short page comes back.
      val all = BrowseTreeCache.getChildren(parentId)
      CarAutoLog.d(
        "onGetChildren $parentId page=$page/$pageSize of ${all.size} by ${browser.packageName}",
      )
      val from = page.toLong() * pageSize.toLong()
      if (from >= all.size) {
        return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.of(), params))
      }
      val start = from.toInt()
      val end = minOf(from + pageSize.toLong(), all.size.toLong()).toInt()
      val items = ImmutableList.copyOf(all.subList(start, end).map { it.toMediaItem() })
      return Futures.immediateFuture(LibraryResult.ofItemList(items, params))
    }

    override fun onAddMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: MutableList<MediaItem>,
    ): ListenableFuture<MutableList<MediaItem>> {
      val first = mediaItems.firstOrNull()?.mediaId
      if (first.isNullOrEmpty()) return Futures.immediateFuture(mediaItems)
      return resolvePlayable(first, mediaItems)
    }

    override fun onSetMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: MutableList<MediaItem>,
      startIndex: Int,
      startPositionMs: Long,
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
      val first = mediaItems.firstOrNull()?.mediaId
      if (first.isNullOrEmpty()) {
        return Futures.immediateFuture(
          MediaSession.MediaItemsWithStartPosition(mediaItems, startIndex, startPositionMs),
        )
      }
      val node = findNode(first)
      if (node != null && node.playable) {
        jsPlayer?.applyTappedItem(node)
        emitPlay(first)
        return Futures.immediateFuture(
          MediaSession.MediaItemsWithStartPosition(
            mutableListOf(node.toMediaItem()),
            0,
            0L,
          ),
        )
      }
      return Futures.immediateFuture(
        MediaSession.MediaItemsWithStartPosition(mediaItems, startIndex, startPositionMs),
      )
    }

    /**
     * media3 hands a play request to this callback instead of to the player
     * whenever the timeline is empty, so on a cold session this — not
     * `JsProxyPlayer.handleSetPlayWhenReady` — is the only hook the car's play
     * button ever reaches. Returning a bare failure made it a no-op.
     *
     * We can't answer synchronously: the queue to resume lives in MMKV and only
     * JS can read it. So hand the tap over the same way a browse tap is handled
     * (parked natively and replayed once the runtime is up), let JS rehydrate
     * and start playback, and let the mirror pushes that follow fill the session
     * in. The failure still stands — there is nothing to hand back *now*.
     *
     * [isForPlayback] is what keeps that honest: media3 passes `true` only from
     * an actual play request, and `false` when the system is merely collecting
     * items to render its media resumption card. Booting the React runtime for
     * the latter would be a boot-time tax paid for a button nobody pressed.
     */
    override fun onPlaybackResumption(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      isForPlayback: Boolean,
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
      CarAutoLog.d(
        "onPlaybackResumption by ${controller.packageName} forPlayback=$isForPlayback",
      )
      if (isForPlayback) {
        if (!CarAutoModule.deliverTransport("play", parkWhenCold = true)) {
          ReactHostBoot.ensureJsRuntime(applicationContext)
        }
      }
      // media3 logs the resulting UnsupportedOperationException at warning level
      // ("Make sure to implement MediaSession.Callback.onPlaybackResumption()").
      // Expected: there is nothing to hand back *synchronously* — JS answers by
      // starting playback and pushing the mirror.
      return Futures.immediateFailedFuture(UnsupportedOperationException("no resumption state"))
    }

    private fun resolvePlayable(
      mediaId: String,
      original: MutableList<MediaItem>,
    ): ListenableFuture<MutableList<MediaItem>> {
      emitPlay(mediaId)
      val node = findNode(mediaId)
      if (node != null && node.playable) {
        jsPlayer?.applyTappedItem(node)
        return Futures.immediateFuture(mutableListOf(node.toMediaItem()))
      }
      return Futures.immediateFuture(original)
    }

    private fun emitPlay(mediaId: String) {
      val parentId = BrowseTreeCache.findParentOf(mediaId)
      CarAutoLog.d("emitPlay id=$mediaId parent=$parentId")
      if (CarAutoModule.deliverPlay(mediaId, parentId)) return
      // Cold process: Android Auto bound this service without ever starting the
      // app's Activity, so there was no JS to hand the tap to. deliverPlay has
      // parked it; notifyReady replays it once the listeners are up.
      CarAutoLog.d("no JS yet, queued play and booting runtime")
      ReactHostBoot.ensureJsRuntime(applicationContext)
    }
  }

  private fun findNode(mediaId: String): BrowseNode? {
    BrowseTreeCache.getChildren(BrowseTreeCache.ROOT_ID).firstOrNull { it.id == mediaId }?.let { return it }
    val seen = HashSet<String>()
    val stack = ArrayDeque<String>()
    stack.addLast(BrowseTreeCache.ROOT_ID)
    while (stack.isNotEmpty()) {
      val pid = stack.removeLast()
      if (!seen.add(pid)) continue
      for (c in BrowseTreeCache.getChildren(pid)) {
        if (c.id == mediaId) return c
        if (!c.playable) stack.addLast(c.id)
      }
    }
    return null
  }

  companion object {
    @Volatile var activePlayer: JsProxyPlayer? = null
      private set

    // Held so a tree pushed from JS can tell subscribed browsers to re-read the
    // parents that changed — without it a new tree only reaches the car when the
    // user navigates, which never happens for the screen they are already on.
    @Volatile var activeSession: MediaLibrarySession? = null
      private set

    // Controllers we treat as "the user is in the car". Other binders (system
    // media resumption, assistants) still work — their first play just pays the
    // runtime boot — but they don't get to spin up JS merely by browsing.
    private val CAR_HOST_PACKAGES = setOf(
      "com.google.android.projection.gearhead",
      "com.google.android.gms.car",
      "com.google.android.apps.automotive.templates.host",
    )
  }
}

// Only the commands worth reading in a trace; anything else prints its raw id.
@OptIn(UnstableApi::class)
private fun playerCommandName(command: Int): String = when (command) {
  Player.COMMAND_PLAY_PAUSE -> "PLAY_PAUSE"
  Player.COMMAND_PREPARE -> "PREPARE"
  Player.COMMAND_STOP -> "STOP"
  Player.COMMAND_SEEK_TO_NEXT -> "SEEK_TO_NEXT"
  Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> "SEEK_TO_NEXT_MEDIA_ITEM"
  Player.COMMAND_SEEK_TO_PREVIOUS -> "SEEK_TO_PREVIOUS"
  Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> "SEEK_TO_PREVIOUS_MEDIA_ITEM"
  Player.COMMAND_SEEK_TO_MEDIA_ITEM -> "SEEK_TO_MEDIA_ITEM"
  Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM -> "SEEK_IN_CURRENT_MEDIA_ITEM"
  Player.COMMAND_SET_MEDIA_ITEM -> "SET_MEDIA_ITEM"
  Player.COMMAND_CHANGE_MEDIA_ITEMS -> "CHANGE_MEDIA_ITEMS"
  Player.COMMAND_SET_SHUFFLE_MODE -> "SET_SHUFFLE_MODE"
  Player.COMMAND_SET_REPEAT_MODE -> "SET_REPEAT_MODE"
  else -> "command#$command"
}

@OptIn(UnstableApi::class)
private fun BrowseNode.toMediaItem(): MediaItem {
  val extras = Bundle()
  // contentStyle on a browsable node tells AA how to render *its children*.
  if (!playable) {
    val styleValue = when (contentStyle) {
      "grid" -> MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_GRID_ITEM
      "list" -> MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM
      else -> MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM
    }
    extras.putInt(MediaConstants.EXTRAS_KEY_CONTENT_STYLE_BROWSABLE, styleValue)
    extras.putInt(MediaConstants.EXTRAS_KEY_CONTENT_STYLE_PLAYABLE, styleValue)
  }
  val builder = MediaMetadata.Builder()
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIsBrowsable(!playable)
    .setIsPlayable(playable)
    .setMediaType(
      if (playable) MediaMetadata.MEDIA_TYPE_MUSIC
      else MediaMetadata.MEDIA_TYPE_FOLDER_MIXED,
    )
    .setExtras(extras)
  CarArtwork.apply(builder, localArtworkUrl, artworkUrl)
  return MediaItem.Builder()
    .setMediaId(id)
    .setMediaMetadata(builder.build())
    .build()
}
