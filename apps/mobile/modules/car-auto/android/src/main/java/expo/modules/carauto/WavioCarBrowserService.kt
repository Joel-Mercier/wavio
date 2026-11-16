package expo.modules.carauto

import android.os.Bundle
import android.provider.MediaStore
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.CommandButton
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaConstants
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import org.json.JSONObject

/**
 * The MediaLibraryService Android Auto binds. Browsing is answered from
 * [BrowseStore], asking JS for anything missing or stale; plays, searches,
 * voice requests and list-item actions are forwarded to JS through
 * [CarAutoModule], parked and replayed when the runtime is still booting.
 * The session's player is a [JsProxyPlayer] mirroring expo-audio.
 */
@OptIn(UnstableApi::class)
class WavioCarBrowserService : MediaLibraryService() {
  private var session: MediaLibrarySession? = null
  private var jsPlayer: JsProxyPlayer? = null
  private var rootLimit = DEFAULT_ROOT_LIMIT

  override fun onCreate() {
    super.onCreate()
    BrowseStore.loadFromDiskIfNeeded(applicationContext)
    CarLabels.load(applicationContext)
    val player = JsProxyPlayer(applicationContext).also {
      jsPlayer = it
      activePlayer = it
      CarPlaybackMirror.seed(it)
    }
    // Android Auto rebuilds its queue list, scrolled back to the top, on every
    // playback-state update. media3 would publish one every 3 s just to refresh
    // the position, which hosts already extrapolate from the last update.
    session = MediaLibrarySession.Builder(this, player, LibraryCallback())
      .setId("WavioCarBrowserSession")
      .setPeriodicPositionUpdateEnabled(false)
      .setCommandButtonsForMediaItems(itemActionButtons())
      .setMediaButtonPreferences(mediaButtons(player))
      .build()
      .also { activeSession = it }
    player.addListener(
      object : Player.Listener {
        override fun onShuffleModeEnabledChanged(shuffleModeEnabled: Boolean) = refreshMediaButtons()

        override fun onRepeatModeChanged(repeatMode: Int) = refreshMediaButtons()
      },
    )
    CarAutoLog.d("browser service created")
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

  override fun onDestroy() {
    CarAutoLog.d("browser service destroyed")
    CarAutoModule.setCarConnected(false)
    if (activePlayer === jsPlayer) activePlayer = null
    if (activeSession === session) activeSession = null
    session?.run { player.release(); release() }
    session = null
    jsPlayer = null
    super.onDestroy()
  }

  // The proxy owns no audio: expo-audio's service posts the real notification,
  // and a second one started from a merely-bound service is refused on 12+.
  override fun onUpdateNotification(session: MediaSession, startInForegroundRequired: Boolean) {
    CarAutoLog.d("notification suppressed (foreground=$startInForegroundRequired)")
  }

  private inner class LibraryCallback : MediaLibrarySession.Callback {
    override fun onConnect(
      session: MediaSession,
      controller: MediaSession.ControllerInfo,
    ): MediaSession.ConnectionResult {
      CarAutoLog.d(
        "onConnect by ${controller.packageName} itemActions=${controller.maxCommandsForMediaItems}",
      )
      if (controller.packageName in CAR_HOST_PACKAGES) {
        CarAutoModule.setCarConnected(true)
      }
      // Granted to every controller: the platform session Android Auto reads
      // only carries commands the media notification controller was granted.
      val commands = MediaSession.ConnectionResult.DEFAULT_SESSION_AND_LIBRARY_COMMANDS.buildUpon()
      PLAYER_COMMANDS.forEach(commands::add)
      ITEM_ACTIONS.forEach { commands.add(SessionCommand(it, Bundle.EMPTY)) }
      return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
        .setAvailableSessionCommands(commands.build())
        .build()
    }

    // Not what ends the car session: legacy browsers are only reported gone
    // after an inactivity timeout. onDestroy is the reliable edge.
    override fun onDisconnected(session: MediaSession, controller: MediaSession.ControllerInfo) {
      CarAutoLog.d("onDisconnected by ${controller.packageName}")
    }

    override fun onPlayerCommandRequest(
      session: MediaSession,
      controller: MediaSession.ControllerInfo,
      playerCommand: Int,
    ): Int {
      CarAutoLog.d("playerCommand $playerCommand by ${controller.packageName}")
      return SessionResult.RESULT_SUCCESS
    }

    override fun onGetLibraryRoot(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<MediaItem>> {
      CarAutoLog.d("onGetLibraryRoot by ${browser.packageName}")
      if (browser.packageName in CAR_HOST_PACKAGES) {
        ReactHostBoot.ensureJsRuntime(applicationContext)
      }
      rootLimit = params?.extras?.getInt(MediaConstants.EXTRAS_KEY_ROOT_CHILDREN_LIMIT, DEFAULT_ROOT_LIMIT)
        ?.takeIf { it > 0 } ?: DEFAULT_ROOT_LIMIT
      val rootExtras = Bundle().apply {
        putInt(MediaConstants.EXTRAS_KEY_CONTENT_STYLE_BROWSABLE, MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM)
        putInt(MediaConstants.EXTRAS_KEY_CONTENT_STYLE_PLAYABLE, MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM)
      }
      val root = MediaItem.Builder()
        .setMediaId(BrowseStore.ROOT_ID)
        .setMediaMetadata(
          MediaMetadata.Builder()
            .setIsBrowsable(true)
            .setIsPlayable(false)
            .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
            .build(),
        )
        .build()
      val resultParams = LibraryParams.Builder().setExtras(rootExtras).build()
      return Futures.immediateFuture(LibraryResult.ofItem(root, resultParams))
    }

    override fun onSubscribe(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      parentId: String,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<Void>> {
      session.notifyChildrenChanged(browser, parentId, BrowseStore.childCount(parentId), params)
      return Futures.immediateFuture(LibraryResult.ofVoid())
    }

    override fun onGetItem(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      mediaId: String,
    ): ListenableFuture<LibraryResult<MediaItem>> {
      val node = BrowseStore.find(mediaId) ?: linkedItem(mediaId)
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
      if (BrowseStore.has(parentId)) {
        if (!BrowseStore.isFresh(parentId)) {
          BrowseStore.markFresh(parentId)
          CarAutoModule.deliverChildrenRequest(parentId)
        }
        return Futures.immediateFuture(childrenPage(parentId, page, pageSize, params))
      }
      CarAutoLog.d("onGetChildren $parentId: asking JS")
      if (parentId == BrowseStore.ROOT_ID || CarAutoModule.instance == null) {
        ReactHostBoot.ensureJsRuntime(applicationContext)
      }
      return Futures.transform(
        PendingRequests.awaitChildren(parentId),
        { childrenPage(parentId, page, pageSize, params) },
        MoreExecutors.directExecutor(),
      )
    }

    override fun onSearch(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      query: String,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<Void>> {
      CarAutoLog.d("onSearch \"$query\" by ${browser.packageName}")
      Futures.addCallback(
        PendingRequests.awaitSearch(query),
        object : com.google.common.util.concurrent.FutureCallback<Unit> {
          override fun onSuccess(result: Unit?) {
            val count = BrowseStore.getSearch(query)?.size ?: 0
            session.notifySearchResultChanged(browser, query, count, params)
          }

          override fun onFailure(t: Throwable) = Unit
        },
        MoreExecutors.directExecutor(),
      )
      return Futures.immediateFuture(LibraryResult.ofVoid())
    }

    override fun onGetSearchResult(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      query: String,
      page: Int,
      pageSize: Int,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
      val nodes = BrowseStore.getSearch(query) ?: emptyList()
      return Futures.immediateFuture(
        LibraryResult.ofItemList(ImmutableList.copyOf(nodes.map { it.toMediaItem() }), params),
      )
    }

    // Android Auto doesn't page (it asks with Int.MAX_VALUE); other browsers may.
    private fun childrenPage(
      parentId: String,
      page: Int,
      pageSize: Int,
      params: LibraryParams?,
    ): LibraryResult<ImmutableList<MediaItem>> {
      var all = BrowseStore.getChildren(parentId) ?: emptyList()
      if (parentId == BrowseStore.ROOT_ID) {
        all = all.filter { it.browsable }.take(rootLimit)
      }
      val from = page.toLong() * pageSize.toLong()
      if (from >= all.size) return LibraryResult.ofItemList(ImmutableList.of(), params)
      val end = minOf(from + pageSize.toLong(), all.size.toLong()).toInt()
      return LibraryResult.ofItemList(
        ImmutableList.copyOf(all.subList(from.toInt(), end).map { it.toMediaItem() }),
        params,
      )
    }

    override fun onAddMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: MutableList<MediaItem>,
    ): ListenableFuture<MutableList<MediaItem>> {
      val first = mediaItems.firstOrNull() ?: return Futures.immediateFuture(mediaItems)
      return Futures.immediateFuture(handleRequestedItem(first)?.let { mutableListOf(it) } ?: mediaItems)
    }

    override fun onSetMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: MutableList<MediaItem>,
      startIndex: Int,
      startPositionMs: Long,
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
      val first = mediaItems.firstOrNull()
      val handled = first?.let { handleRequestedItem(it) }
      return Futures.immediateFuture(
        if (handled != null) {
          MediaSession.MediaItemsWithStartPosition(mutableListOf(handled), 0, 0L)
        } else {
          MediaSession.MediaItemsWithStartPosition(mediaItems, startIndex, startPositionMs)
        },
      )
    }

    override fun onCustomCommand(
      session: MediaSession,
      controller: MediaSession.ControllerInfo,
      customCommand: SessionCommand,
      args: Bundle,
    ): ListenableFuture<SessionResult> {
      val action = customCommand.customAction
      PLAYER_TRANSPORT[action]?.let { transport ->
        CarAutoLog.d("player button $transport by ${controller.packageName}")
        CarAutoModule.deliverTransport(transport)
        return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
      }
      val itemAction = ITEM_ACTION_IDS[action]
        ?: return super.onCustomCommand(session, controller, customCommand, args)
      val mediaId = args.getString(MediaConstants.EXTRA_KEY_MEDIA_ID)
        ?: return Futures.immediateFuture(SessionResult(SessionResult.RESULT_ERROR_BAD_VALUE))
      CarAutoLog.d("item action $itemAction on $mediaId by ${controller.packageName}")
      return Futures.transform(
        PendingRequests.awaitAction(itemAction, mediaId),
        { json -> actionResult(json) },
        MoreExecutors.directExecutor(),
      )
    }

    // media3 routes a play request here instead of to the player whenever the
    // timeline is empty. Only JS can read the saved queue, so hand it a parked
    // "play" and let the mirror pushes that follow fill the session.
    // `isForPlayback` is false when the system only renders its resumption card.
    override fun onPlaybackResumption(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      isForPlayback: Boolean,
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
      CarAutoLog.d("onPlaybackResumption by ${controller.packageName} forPlayback=$isForPlayback")
      if (isForPlayback && !CarAutoModule.deliverTransport("play", parkWhenCold = true)) {
        ReactHostBoot.ensureJsRuntime(applicationContext)
      }
      return Futures.immediateFailedFuture(UnsupportedOperationException("no resumption state"))
    }
  }

  // A row tap carries a media id from the tree; a voice request carries an
  // empty id and the spoken query in its request metadata.
  private fun handleRequestedItem(item: MediaItem): MediaItem? {
    val query = item.requestMetadata.searchQuery
    if (item.mediaId.isEmpty() && query != null) {
      CarAutoLog.d("voice \"$query\"")
      val request = Bundle().apply {
        putString("query", query)
        item.requestMetadata.extras?.let { extras ->
          VOICE_HINTS.forEach { (key, name) -> extras.getString(key)?.let { putString(name, it) } }
        }
      }
      if (!CarAutoModule.deliverPlaySearch(request)) ReactHostBoot.ensureJsRuntime(applicationContext)
      return MediaItem.Builder()
        .setMediaId(VOICE_PLACEHOLDER_ID)
        .setMediaMetadata(MediaMetadata.Builder().setTitle(query).setIsPlayable(true).build())
        .build()
    }
    if (item.mediaId.isEmpty()) return null
    val node = BrowseStore.find(item.mediaId)
    if (node != null && node.playable) jsPlayer?.applyTappedItem(node)
    CarAutoLog.d("play ${item.mediaId}")
    if (!CarAutoModule.deliverPlay(item.mediaId)) {
      CarAutoLog.d("no JS yet, parked the tap and booting the runtime")
      ReactHostBoot.ensureJsRuntime(applicationContext)
    }
    return node?.toMediaItem()
  }

  private fun actionResult(json: String?): SessionResult {
    val o = json?.let { runCatching { JSONObject(it) }.getOrNull() }
      ?: return SessionResult(SessionResult.RESULT_ERROR_UNKNOWN)
    val extras = Bundle()
    o.optStringOrNull("message")?.let { extras.putString(RESULT_MESSAGE, it) }
    o.optStringOrNull("refreshItem")?.let { extras.putString(RESULT_REFRESH_ITEM, it) }
    if (o.optBoolean("showPlaying", false)) extras.putString(RESULT_SHOW_PLAYING_ITEM, null)
    return if (o.optBoolean("ok", false)) {
      SessionResult(SessionResult.RESULT_SUCCESS, extras)
    } else {
      SessionResult(SessionResult.RESULT_ERROR_UNKNOWN, extras)
    }
  }

  // An item the host only knows from a subtitle link on the playing track.
  private fun linkedItem(mediaId: String): BrowseNode? {
    val (artistId, name) = CarPlaybackMirror.currentArtist ?: return null
    if (artistId != mediaId) return null
    return BrowseNode(
      id = mediaId,
      title = name,
      subtitle = null,
      artworkUrl = null,
      playable = true,
      browsable = true,
      childrenStyle = "list",
      itemStyle = null,
      groupTitle = null,
      icon = "artists",
      actions = emptyList(),
      download = null,
      explicit = false,
      completion = null,
    )
  }

  private fun itemActionButtons(): List<CommandButton> = ITEM_ACTION_IDS.map { (command, action) ->
    CommandButton.Builder(ACTION_ICON_CONSTANTS[action] ?: CommandButton.ICON_UNDEFINED)
      .setDisplayName(CarLabels["action${action.replaceFirstChar(Char::uppercase)}"])
      .setSessionCommand(SessionCommand(command, Bundle.EMPTY))
      .apply {
        CarIcons.ACTION_ICONS[action]
          ?.let { CarIcons.resourceUri(applicationContext, it) }
          ?.let(::setIconUri)
      }
      .build()
  }

  private fun BrowseNode.toMediaItem(): MediaItem {
    val extras = Bundle()
    if (browsable) {
      styleValue(childrenStyle)?.let {
        extras.putInt(MediaConstants.EXTRAS_KEY_CONTENT_STYLE_BROWSABLE, it)
        extras.putInt(MediaConstants.EXTRAS_KEY_CONTENT_STYLE_PLAYABLE, it)
      }
    }
    styleValue(itemStyle)?.let { extras.putInt(MediaConstants.EXTRAS_KEY_CONTENT_STYLE_SINGLE_ITEM, it) }
    groupTitle?.let { extras.putString(MediaConstants.EXTRAS_KEY_CONTENT_STYLE_GROUP_TITLE, it) }
    if (explicit) extras.putLong(MediaConstants.EXTRAS_KEY_IS_EXPLICIT, 1L)
    when (download) {
      "downloaded" -> extras.putLong(MediaConstants.EXTRAS_KEY_DOWNLOAD_STATUS, MediaConstants.EXTRAS_VALUE_STATUS_DOWNLOADED)
      "downloading" -> extras.putLong(MediaConstants.EXTRAS_KEY_DOWNLOAD_STATUS, MediaConstants.EXTRAS_VALUE_STATUS_DOWNLOADING)
    }
    completion?.let { value ->
      val status = when {
        value >= 1.0 -> MediaConstants.EXTRAS_VALUE_COMPLETION_STATUS_FULLY_PLAYED
        value > 0.0 -> MediaConstants.EXTRAS_VALUE_COMPLETION_STATUS_PARTIALLY_PLAYED
        else -> MediaConstants.EXTRAS_VALUE_COMPLETION_STATUS_NOT_PLAYED
      }
      extras.putInt(MediaConstants.EXTRAS_KEY_COMPLETION_STATUS, status)
      extras.putDouble(MediaConstants.EXTRAS_KEY_COMPLETION_PERCENTAGE, value.coerceIn(0.0, 1.0))
    }
    val builder = MediaMetadata.Builder()
      .setTitle(title)
      .setSubtitle(subtitle)
      .setIsBrowsable(browsable)
      .setIsPlayable(playable)
      .setMediaType(if (browsable) MediaMetadata.MEDIA_TYPE_FOLDER_MIXED else MediaMetadata.MEDIA_TYPE_MUSIC)
      .setExtras(extras)
    if (actions.isNotEmpty()) {
      builder.setSupportedCommands(actions.mapNotNull { ITEM_ACTION_COMMANDS[it] })
    }
    val artwork = CarArtwork.uriFor(artworkUrl, artFallback)
      ?: CarIcons.nodeIcon(applicationContext, icon)
      ?: artFallback?.let(CarArtworkProvider::fallbackUri)
    artwork?.let { builder.setArtworkUri(it) }
    return MediaItem.Builder()
      .setMediaId(id)
      .setMediaMetadata(builder.build())
      .build()
  }

  companion object {
    @Volatile var activePlayer: JsProxyPlayer? = null
      private set

    @Volatile var activeSession: MediaLibrarySession? = null
      private set

    // Rebuilt when JS pushes new button state or labels, and when the mirrored
    // shuffle / repeat mode changes (the repeat button carries the next mode).
    fun refreshMediaButtons() {
      val session = activeSession ?: return
      session.setMediaButtonPreferences(mediaButtons(session.player))
    }

    private const val DEFAULT_ROOT_LIMIT = 4
    private const val VOICE_PLACEHOLDER_ID = "voice"
    private const val PREFIX = "expo.modules.carauto.action."

    private const val RESULT_MESSAGE = "androidx.media.utils.extras.KEY_CUSTOM_BROWSER_ACTION_RESULT_MESSAGE"
    private const val RESULT_REFRESH_ITEM = "androidx.media.utils.extras.KEY_CUSTOM_BROWSER_ACTION_RESULT_REFRESH_ITEM"
    private const val RESULT_SHOW_PLAYING_ITEM = "androidx.media.utils.extras.KEY_CUSTOM_BROWSER_ACTION_RESULT_SHOW_PLAYING_ITEM"

    private val PLAYER_TRANSPORT = mapOf(
      "${PREFIX}FAVORITE" to "favorite",
      "${PREFIX}RADIO" to "radio",
      "${PREFIX}SEEK_BACK" to "seekBack",
      "${PREFIX}SEEK_FORWARD" to "seekForward",
    )
    private val PLAYER_COMMANDS = PLAYER_TRANSPORT.keys.map { SessionCommand(it, Bundle.EMPTY) }

    private val ITEM_ACTION_IDS = linkedMapOf(
      "${PREFIX}item.FAVORITE_ADD" to "favoriteAdd",
      "${PREFIX}item.FAVORITE_REMOVE" to "favoriteRemove",
      "${PREFIX}item.RADIO" to "radio",
      "${PREFIX}item.PLAY_NEXT" to "playNext",
      "${PREFIX}item.ADD_TO_QUEUE" to "addToQueue",
      "${PREFIX}item.SHUFFLE" to "shuffle",
      "${PREFIX}item.DOWNLOAD" to "download",
    )
    private val ITEM_ACTIONS = ITEM_ACTION_IDS.keys
    private val ACTION_ICON_CONSTANTS = mapOf(
      "favoriteAdd" to CommandButton.ICON_HEART_UNFILLED,
      "favoriteRemove" to CommandButton.ICON_HEART_FILLED,
      "radio" to CommandButton.ICON_RADIO,
      "playNext" to CommandButton.ICON_QUEUE_NEXT,
      "addToQueue" to CommandButton.ICON_QUEUE_ADD,
      "shuffle" to CommandButton.ICON_SHUFFLE_ON,
    )
    private val ITEM_ACTION_COMMANDS = ITEM_ACTION_IDS.entries.associate { (command, action) -> action to command }

    private val VOICE_HINTS = mapOf(
      MediaStore.EXTRA_MEDIA_ARTIST to "artist",
      MediaStore.EXTRA_MEDIA_ALBUM to "album",
      MediaStore.EXTRA_MEDIA_GENRE to "genre",
      MediaStore.EXTRA_MEDIA_PLAYLIST to "playlist",
      MediaStore.EXTRA_MEDIA_TITLE to "title",
    )

    private val CAR_HOST_PACKAGES = setOf(
      "com.google.android.projection.gearhead",
      "com.google.android.gms.car",
      "com.google.android.apps.automotive.templates.host",
    )

    private fun styleValue(style: String?): Int? = when (style) {
      "grid" -> MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_GRID_ITEM
      "list" -> MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM
      "categoryList" -> MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_CATEGORY_LIST_ITEM
      "categoryGrid" -> MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_CATEGORY_GRID_ITEM
      else -> null
    }

    // Never SLOT_BACK / SLOT_FORWARD: media3 then drops skip previous / next
    // from the platform session, which is where Android Auto, assistants and
    // AVRCP read them (see the expo-audio patch's updateSessionCustomLayout).
    private fun mediaButtons(player: Player): List<CommandButton> = buildList {
      val state = CarPlaybackMirror.buttons
      if (state.longForm) {
        add(
          CommandButton.Builder(CommandButton.ICON_SKIP_BACK_30)
            .setDisplayName(CarLabels["seekBack"])
            .setSessionCommand(SessionCommand("${PREFIX}SEEK_BACK", Bundle.EMPTY))
            .setSlots(CommandButton.SLOT_BACK_SECONDARY, CommandButton.SLOT_OVERFLOW)
            .build(),
        )
        add(
          CommandButton.Builder(CommandButton.ICON_SKIP_FORWARD_30)
            .setDisplayName(CarLabels["seekForward"])
            .setSessionCommand(SessionCommand("${PREFIX}SEEK_FORWARD", Bundle.EMPTY))
            .setSlots(CommandButton.SLOT_FORWARD_SECONDARY, CommandButton.SLOT_OVERFLOW)
            .build(),
        )
        return@buildList
      }
      state.favorite?.let { favorite ->
        add(
          CommandButton.Builder(
            if (favorite) CommandButton.ICON_HEART_FILLED else CommandButton.ICON_HEART_UNFILLED,
          )
            .setDisplayName(CarLabels[if (favorite) "favoriteRemove" else "favoriteAdd"])
            .setSessionCommand(SessionCommand("${PREFIX}FAVORITE", Bundle.EMPTY))
            .setSlots(CommandButton.SLOT_FORWARD_SECONDARY, CommandButton.SLOT_OVERFLOW)
            .build(),
        )
      }
      if (state.shuffle) {
        val shuffle = player.shuffleModeEnabled
        add(
          CommandButton.Builder(if (shuffle) CommandButton.ICON_SHUFFLE_ON else CommandButton.ICON_SHUFFLE_OFF)
            .setDisplayName(CarLabels[if (shuffle) "shuffleOff" else "shuffleOn"])
            .setPlayerCommand(Player.COMMAND_SET_SHUFFLE_MODE, !shuffle)
            .setSlots(CommandButton.SLOT_BACK_SECONDARY, CommandButton.SLOT_OVERFLOW)
            .build(),
        )
      }
      if (state.repeat) {
        val (icon, label, next) = when (player.repeatMode) {
          Player.REPEAT_MODE_ALL -> Triple(CommandButton.ICON_REPEAT_ALL, "repeatOne", Player.REPEAT_MODE_ONE)
          Player.REPEAT_MODE_ONE -> Triple(CommandButton.ICON_REPEAT_ONE, "repeatOff", Player.REPEAT_MODE_OFF)
          else -> Triple(CommandButton.ICON_REPEAT_OFF, "repeatAll", Player.REPEAT_MODE_ALL)
        }
        add(
          CommandButton.Builder(icon)
            .setDisplayName(CarLabels[label])
            .setPlayerCommand(Player.COMMAND_SET_REPEAT_MODE, next)
            .setSlots(CommandButton.SLOT_OVERFLOW)
            .build(),
        )
      }
      if (state.radio) {
        add(
          CommandButton.Builder(CommandButton.ICON_RADIO)
            .setDisplayName(CarLabels["radio"])
            .setSessionCommand(SessionCommand("${PREFIX}RADIO", Bundle.EMPTY))
            .setSlots(CommandButton.SLOT_OVERFLOW)
            .build(),
        )
      }
    }
  }
}
