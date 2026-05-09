package expo.modules.carauto

import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaConstants
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
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
    val player = JsProxyPlayer().also {
      jsPlayer = it
      activePlayer = it
    }
    session = MediaLibrarySession.Builder(this, player, LibraryCallback())
      .setId("WavioCarBrowserSession")
      .build()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

  override fun onDestroy() {
    if (activePlayer === jsPlayer) activePlayer = null
    session?.run { player.release(); release() }
    session = null
    jsPlayer = null
    super.onDestroy()
  }

  private inner class LibraryCallback : MediaLibrarySession.Callback {
    override fun onGetLibraryRoot(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<MediaItem>> {
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
      val nodes = BrowseTreeCache.getChildren(parentId)
      val items = ImmutableList.copyOf(nodes.map { it.toMediaItem() })
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

    override fun onPlaybackResumption(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> =
      Futures.immediateFailedFuture(UnsupportedOperationException("no resumption state"))

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
      CarAutoModule.instance?.emitPlayEvent(mediaId, parentId)
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
  }
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
  val metadata = MediaMetadata.Builder()
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIsBrowsable(!playable)
    .setIsPlayable(playable)
    .setArtworkUri(artworkUrl?.let { android.net.Uri.parse(it) })
    .setMediaType(
      if (playable) MediaMetadata.MEDIA_TYPE_MUSIC
      else MediaMetadata.MEDIA_TYPE_FOLDER_MIXED,
    )
    .setExtras(extras)
    .build()
  return MediaItem.Builder()
    .setMediaId(id)
    .setMediaMetadata(metadata)
    .build()
}
