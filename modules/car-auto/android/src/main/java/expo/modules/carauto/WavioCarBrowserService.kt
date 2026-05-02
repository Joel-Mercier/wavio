package expo.modules.carauto

import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Standalone MediaLibraryService that exposes the JS-built BrowseTree to
 * Android Auto. Tapping a playable item emits a `play` event to JS via
 * CarAutoModule; JS resolves the mediaId to tracks and drives playback
 * through the existing expo-audio player.
 *
 * KNOWN LIMITATION: This service runs its own (empty) ExoPlayer + session,
 * so the in-car Now Playing UI will NOT reflect playback state until a
 * follow-up wires this session's Player to the same media3 instance that
 * expo-audio's AudioControlsService owns. A second iteration after the first
 * dev build is expected — see plan doc.
 */
@OptIn(UnstableApi::class)
class WavioCarBrowserService : MediaLibraryService() {
  private var session: MediaLibrarySession? = null
  private var idlePlayer: ExoPlayer? = null

  override fun onCreate() {
    super.onCreate()
    val player = ExoPlayer.Builder(this).build().also { idlePlayer = it }
    session = MediaLibrarySession.Builder(this, player, LibraryCallback()).build()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

  override fun onDestroy() {
    session?.run { player.release(); release() }
    session = null
    idlePlayer = null
    super.onDestroy()
  }

  private inner class LibraryCallback : MediaLibrarySession.Callback {
    override fun onGetLibraryRoot(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<MediaItem>> {
      val root = MediaItem.Builder()
        .setMediaId(BrowseTreeCache.ROOT_ID)
        .setMediaMetadata(
          MediaMetadata.Builder()
            .setIsBrowsable(true)
            .setIsPlayable(false)
            .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
            .build(),
        )
        .build()
      return Futures.immediateFuture(LibraryResult.ofItem(root, params))
    }

    override fun onGetChildren(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      parentId: String,
      page: Int,
      pageSize: Int,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
      val nodes = if (parentId == BrowseTreeCache.ROOT_ID) {
        BrowseTreeCache.getRootSections()
      } else {
        BrowseTreeCache.getSection(parentId)
      }
      val items = ImmutableList.copyOf(nodes.map { it.toMediaItem() })
      return Futures.immediateFuture(LibraryResult.ofItemList(items, params))
    }

    override fun onAddMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: MutableList<MediaItem>,
    ): ListenableFuture<MutableList<MediaItem>> {
      // Auto sends the user's tap here. Forward the mediaId to JS and return
      // an empty list so this session doesn't try to play locally.
      val first = mediaItems.firstOrNull()?.mediaId
      if (!first.isNullOrEmpty()) {
        CarAutoModule.instance?.emitPlayEvent(first)
      }
      return Futures.immediateFuture(mutableListOf())
    }
  }
}

@OptIn(UnstableApi::class)
private fun BrowseNode.toMediaItem(): MediaItem {
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
    .build()
  return MediaItem.Builder()
    .setMediaId(id)
    .setMediaMetadata(metadata)
    .build()
}
