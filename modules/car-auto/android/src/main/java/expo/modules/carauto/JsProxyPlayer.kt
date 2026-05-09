package expo.modules.carauto

import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Media3 Player whose state is fed from JS (current track + playback state)
 * and whose transport commands are forwarded back to JS via CarAutoModule
 * `transport` events. Backs the MediaLibrarySession that Android Auto talks
 * to, so the in-car mini-player and Now Playing screen reflect real expo-audio
 * playback without a second audio engine.
 */
@OptIn(UnstableApi::class)
class JsProxyPlayer : SimpleBasePlayer(Looper.getMainLooper()) {

  data class NowPlaying(
    val id: String,
    val title: String?,
    val artist: String?,
    val album: String?,
    val artworkUrl: String?,
    val durationMs: Long,
  )

  @Volatile private var nowPlaying: NowPlaying? = null
  // Mirrored queue + current index pushed from JS. When non-empty, the
  // player exposes it as its playlist so AA's queue view shows the full
  // surrounding collection. nowPlaying is still used as the source of truth
  // for metadata (it may carry a more refined version of queue[index]).
  @Volatile private var queue: List<NowPlaying> = emptyList()
  @Volatile private var currentIndex: Int = 0
  @Volatile private var playing: Boolean = false
  @Volatile private var positionMs: Long = 0L
  @Volatile private var positionUpdatedAt: Long = System.currentTimeMillis()
  @Volatile private var shuffle: Boolean = false
  @Volatile private var repeatMode: Int = Player.REPEAT_MODE_OFF

  private val mainHandler = Handler(Looper.getMainLooper())

  // SimpleBasePlayer requires its application thread (main). JS calls land on
  // the JS thread, so hop to the main looper before mutating + invalidating.
  private fun runOnMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block() else mainHandler.post(block)
  }

  fun applyNowPlaying(np: NowPlaying?) = runOnMain {
    nowPlaying = np
    if (np == null) {
      playing = false
      positionMs = 0L
    }
    positionUpdatedAt = System.currentTimeMillis()
    invalidateState()
  }

  // Optimistic placeholder applied the moment the user taps a browsable leaf
  // in Android Auto, before JS has finished resolving + starting playback.
  // This swaps AA's "searching" spinner for the tapped track's metadata; the
  // real now-playing push from JS will refine duration/artist a moment later.
  fun applyTappedItem(node: BrowseNode) = runOnMain {
    nowPlaying = NowPlaying(
      id = node.id,
      title = node.title,
      artist = node.subtitle,
      album = null,
      artworkUrl = node.artworkUrl,
      durationMs = 0L,
    )
    playing = true
    positionMs = 0L
    positionUpdatedAt = System.currentTimeMillis()
    invalidateState()
  }

  fun applyQueue(items: List<NowPlaying>, index: Int) = runOnMain {
    queue = items
    currentIndex = index.coerceIn(0, (items.size - 1).coerceAtLeast(0))
    if (items.isNotEmpty()) {
      val cur = items.getOrNull(currentIndex)
      if (cur != null) nowPlaying = cur
    }
    invalidateState()
  }

  fun applyPlaybackState(isPlaying: Boolean, posMs: Long, shuf: Boolean, repeat: Int) = runOnMain {
    playing = isPlaying
    positionMs = posMs.coerceAtLeast(0L)
    positionUpdatedAt = System.currentTimeMillis()
    shuffle = shuf
    repeatMode = repeat
    invalidateState()
  }

  override fun getState(): State {
    val np = nowPlaying
    val q = queue
    // Prefer the JS-pushed queue. Fall back to the optimistic single-item
    // playlist while the queue hasn't been mirrored yet (e.g. the moment
    // after a tap).
    val source: List<NowPlaying> = when {
      q.isNotEmpty() -> q
      np != null -> listOf(np)
      else -> emptyList()
    }
    val activeIndex = if (q.isNotEmpty()) currentIndex.coerceIn(0, q.size - 1) else 0

    val builder = ImmutableList.builder<MediaItemData>()
    for (item in source) builder.add(item.toMediaItemData())
    val items = builder.build()

    val extrapolated = if (playing) {
      positionMs + (System.currentTimeMillis() - positionUpdatedAt)
    } else {
      positionMs
    }

    val commands = Player.Commands.Builder()
      .add(Player.COMMAND_PLAY_PAUSE)
      .add(Player.COMMAND_PREPARE)
      .add(Player.COMMAND_SET_MEDIA_ITEM)
      .add(Player.COMMAND_CHANGE_MEDIA_ITEMS)
      .add(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
      .add(Player.COMMAND_SEEK_TO_MEDIA_ITEM)
      .add(Player.COMMAND_SEEK_TO_NEXT)
      .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
      .add(Player.COMMAND_SEEK_TO_PREVIOUS)
      .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
      .add(Player.COMMAND_SET_SHUFFLE_MODE)
      .add(Player.COMMAND_SET_REPEAT_MODE)
      .add(Player.COMMAND_GET_CURRENT_MEDIA_ITEM)
      .add(Player.COMMAND_GET_METADATA)
      .add(Player.COMMAND_GET_TIMELINE)
      .build()

    return State.Builder()
      .setAvailableCommands(commands)
      .setPlayWhenReady(playing, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
      .setPlaybackState(if (np != null) Player.STATE_READY else Player.STATE_IDLE)
      .setPlaylist(items)
      .setCurrentMediaItemIndex(if (items.isEmpty()) 0 else activeIndex)
      .setContentPositionMs(extrapolated.coerceAtLeast(0L))
      .setShuffleModeEnabled(shuffle)
      .setRepeatMode(repeatMode)
      .build()
  }

  private fun NowPlaying.toMediaItemData(): MediaItemData {
    val mi = MediaItem.Builder()
      .setMediaId(id)
      .setMediaMetadata(
        MediaMetadata.Builder()
          .setTitle(title)
          .setArtist(artist)
          .setAlbumTitle(album)
          .setArtworkUri(artworkUrl?.let(Uri::parse))
          .setIsBrowsable(false)
          .setIsPlayable(true)
          .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
          .build()
      )
      .build()
    return MediaItemData.Builder(id)
      .setMediaItem(mi)
      .setDurationUs(if (durationMs > 0) durationMs * 1000 else C.TIME_UNSET)
      .build()
  }

  override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
    CarAutoModule.instance?.emitTransport(
      if (playWhenReady) "play" else "pause",
      null,
    )
    return Futures.immediateVoidFuture()
  }

  override fun handlePrepare(): ListenableFuture<*> = Futures.immediateVoidFuture()

  override fun handleSetMediaItems(
    mediaItems: List<MediaItem>,
    startIndex: Int,
    startPositionMs: Long,
  ): ListenableFuture<*> = Futures.immediateVoidFuture()

  override fun handleAddMediaItems(
    index: Int,
    mediaItems: List<MediaItem>,
  ): ListenableFuture<*> = Futures.immediateVoidFuture()

  override fun handleSeek(
    mediaItemIndex: Int,
    positionMs: Long,
    seekCommand: Int,
  ): ListenableFuture<*> {
    when (seekCommand) {
      Player.COMMAND_SEEK_TO_NEXT,
      Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM ->
        CarAutoModule.instance?.emitTransport("next", null)
      Player.COMMAND_SEEK_TO_PREVIOUS,
      Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM ->
        CarAutoModule.instance?.emitTransport("previous", null)
      Player.COMMAND_SEEK_TO_MEDIA_ITEM ->
        CarAutoModule.instance?.emitTransport("seekToIndex", mediaItemIndex.toDouble())
      else ->
        CarAutoModule.instance?.emitTransport("seek", positionMs.toDouble())
    }
    return Futures.immediateVoidFuture()
  }

  override fun handleSetShuffleModeEnabled(shuffleModeEnabled: Boolean): ListenableFuture<*> {
    CarAutoModule.instance?.emitTransport(
      "shuffle",
      if (shuffleModeEnabled) 1.0 else 0.0,
    )
    return Futures.immediateVoidFuture()
  }

  override fun handleSetRepeatMode(repeatMode: Int): ListenableFuture<*> {
    val v = when (repeatMode) {
      Player.REPEAT_MODE_ONE -> "one"
      Player.REPEAT_MODE_ALL -> "all"
      else -> "off"
    }
    CarAutoModule.instance?.emitTransportString("repeat", v)
    return Futures.immediateVoidFuture()
  }
}
