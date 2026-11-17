package expo.modules.carauto

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaConstants
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlin.math.abs

/**
 * Media3 Player whose state is fed from JS and whose transport commands are
 * forwarded back to JS. Backs the session Android Auto talks to, so its
 * playback screen mirrors expo-audio without a second audio engine.
 *
 * Position is handed to media3 as an extrapolating supplier, so the host's
 * progress bar runs on its own between pushes; JS only pushes on a state
 * change or when the real position strays from the extrapolation (a seek).
 */
@OptIn(UnstableApi::class)
class JsProxyPlayer(
  private val appContext: Context,
) : SimpleBasePlayer(Looper.getMainLooper()) {

  data class NowPlaying(
    val id: String,
    val title: String?,
    val artist: String?,
    val album: String?,
    val artworkUrl: String?,
    val durationMs: Long,
    val artistMediaId: String? = null,
    val explicit: Boolean = false,
    val downloaded: Boolean = false,
  )

  data class PlaybackState(
    val playing: Boolean,
    val buffering: Boolean,
    val positionMs: Long,
    val speed: Float,
    val shuffle: Boolean,
    val repeatMode: Int,
  )

  @Volatile private var nowPlaying: NowPlaying? = null
  @Volatile private var queue: List<NowPlaying> = emptyList()
  @Volatile private var currentIndex: Int = 0
  @Volatile private var playback = PlaybackState(false, false, 0L, 1f, false, Player.REPEAT_MODE_OFF)
  @Volatile private var positionAt: Long = System.currentTimeMillis()
  @Volatile private var error: PlaybackException? = null
  private var pendingDiscontinuity = false

  private val mainHandler = Handler(Looper.getMainLooper())

  private fun runOnMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block() else mainHandler.post(block)
  }

  private fun estimatedPositionMs(): Long {
    val state = playback
    if (!state.playing || state.buffering) return state.positionMs
    return state.positionMs + ((System.currentTimeMillis() - positionAt) * state.speed).toLong()
  }

  fun applyNowPlaying(np: NowPlaying?) = runOnMain {
    val trackChanged = np?.id != nowPlaying?.id
    nowPlaying = np
    if (np == null) {
      playback = playback.copy(playing = false, positionMs = 0L)
    } else if (trackChanged) {
      playback = playback.copy(positionMs = 0L)
    }
    positionAt = System.currentTimeMillis()
    invalidateState()
  }

  // Shown the moment a list row is tapped, before JS has resolved and started
  // it, so the host swaps its spinner for the tapped item at once.
  fun applyTappedItem(node: BrowseNode) = runOnMain {
    nowPlaying = NowPlaying(
      id = node.id,
      title = node.title,
      artist = node.subtitle,
      album = null,
      artworkUrl = node.artworkUrl,
      durationMs = 0L,
    )
    queue = emptyList()
    playback = playback.copy(playing = true, buffering = true, positionMs = 0L)
    positionAt = System.currentTimeMillis()
    invalidateState()
  }

  fun applyQueue(items: List<NowPlaying>, index: Int) = runOnMain {
    queue = items
    currentIndex = index.coerceIn(0, (items.size - 1).coerceAtLeast(0))
    items.getOrNull(currentIndex)?.let { nowPlaying = it }
    invalidateState()
  }

  fun applyQueueIndex(index: Int) = runOnMain {
    if (queue.isEmpty()) return@runOnMain
    currentIndex = index.coerceIn(0, queue.size - 1)
    queue.getOrNull(currentIndex)?.let { nowPlaying = it }
    invalidateState()
  }

  fun applyPlaybackState(next: PlaybackState) = runOnMain {
    val expected = estimatedPositionMs()
    if (playback.playing == next.playing && abs(next.positionMs - expected) > SEEK_TOLERANCE_MS) {
      pendingDiscontinuity = true
    }
    playback = next.copy(positionMs = next.positionMs.coerceAtLeast(0L))
    positionAt = System.currentTimeMillis()
    invalidateState()
  }

  fun applyError(next: PlaybackException?) = runOnMain {
    error = next
    invalidateState()
  }

  override fun getState(): State {
    val np = nowPlaying
    val q = queue
    val source: List<NowPlaying> = when {
      q.isNotEmpty() -> q
      np != null -> listOf(np)
      else -> emptyList()
    }
    val activeIndex = if (q.isNotEmpty()) currentIndex.coerceIn(0, q.size - 1) else 0

    val builder = ImmutableList.builder<MediaItemData>()
    val occurrences = HashMap<String, Int>()
    for ((i, item) in source.withIndex()) {
      val occurrence = occurrences[item.id] ?: 0
      occurrences[item.id] = occurrence + 1
      val metadataSource = if (i == activeIndex && np != null && np.id == item.id) np else item
      builder.add(metadataSource.toMediaItemData(occurrence))
    }
    val items = builder.build()
    val state = playback
    val failure = error

    val commands = Player.Commands.Builder()
      .addAll(
        Player.COMMAND_PLAY_PAUSE,
        Player.COMMAND_PREPARE,
        Player.COMMAND_SET_MEDIA_ITEM,
        Player.COMMAND_CHANGE_MEDIA_ITEMS,
        Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM,
        Player.COMMAND_SEEK_TO_MEDIA_ITEM,
        Player.COMMAND_SEEK_TO_NEXT,
        Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
        Player.COMMAND_SEEK_TO_PREVIOUS,
        Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
        Player.COMMAND_SET_SHUFFLE_MODE,
        Player.COMMAND_SET_REPEAT_MODE,
        Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
        Player.COMMAND_GET_METADATA,
        Player.COMMAND_GET_TIMELINE,
      )
      .build()

    val position = estimatedPositionMs().coerceAtLeast(0L)
    val playbackState = when {
      failure != null -> Player.STATE_IDLE
      np == null -> Player.STATE_IDLE
      state.buffering -> Player.STATE_BUFFERING
      else -> Player.STATE_READY
    }
    val result = State.Builder()
      .setAvailableCommands(commands)
      .setPlayWhenReady(state.playing, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
      .setPlaybackState(playbackState)
      .setPlayerError(failure)
      .setPlaylist(items)
      .setCurrentMediaItemIndex(if (items.isEmpty()) 0 else activeIndex)
      .setContentPositionMs(
        if (state.playing && !state.buffering && failure == null) {
          PositionSupplier.getExtrapolating(position, state.speed)
        } else {
          PositionSupplier.getConstant(position)
        },
      )
      .setPlaybackParameters(PlaybackParameters(state.speed))
      .setShuffleModeEnabled(state.shuffle)
      .setRepeatMode(state.repeatMode)
    if (pendingDiscontinuity && items.isNotEmpty()) {
      result.setPositionDiscontinuity(Player.DISCONTINUITY_REASON_SEEK, position)
      pendingDiscontinuity = false
    }
    return result.build()
  }

  // The UID only has to be unique, and stable across queue edits: media3 diffs
  // states by UID, so a positional one would report a media-item transition
  // (resetting the head unit's Now Playing) whenever an earlier entry moved.
  private fun NowPlaying.toMediaItemData(occurrence: Int): MediaItemData {
    val extras = Bundle()
    if (explicit) {
      extras.putLong(MediaConstants.EXTRAS_KEY_IS_EXPLICIT, METADATA_VALUE_ATTRIBUTE_PRESENT)
    }
    if (downloaded) {
      extras.putLong(MediaConstants.EXTRAS_KEY_DOWNLOAD_STATUS, MediaConstants.EXTRAS_VALUE_STATUS_DOWNLOADED)
    }
    if (artistMediaId != null && artist != null) {
      extras.putString(KEY_SUBTITLE_LINK_MEDIA_ID, artistMediaId)
    }
    val metadata = MediaMetadata.Builder()
      .setTitle(title)
      .setArtist(artist)
      .setSubtitle(artist)
      .setAlbumTitle(album)
      .setIsBrowsable(false)
      .setIsPlayable(true)
      .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
      .setExtras(extras)
    CarArtwork.apply(metadata, artworkUrl, CarIcons.TRACK_FALLBACK)
    val item = MediaItem.Builder()
      .setMediaId(id)
      .setMediaMetadata(metadata.build())
      .build()
    return MediaItemData.Builder(if (occurrence == 0) id else "$id#$occurrence")
      .setMediaItem(item)
      .setDurationUs(if (durationMs > 0) durationMs * 1000 else C.TIME_UNSET)
      .build()
  }

  override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
    val action = if (playWhenReady) "play" else "pause"
    CarAutoLog.d("transport $action (mirrored playing=${playback.playing})")
    val delivered = CarAutoModule.deliverTransport(action, parkWhenCold = playWhenReady)
    if (!delivered && playWhenReady) ReactHostBoot.ensureJsRuntime(appContext)
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
    val skip = when (seekCommand) {
      Player.COMMAND_SEEK_TO_NEXT,
      Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> "next"
      Player.COMMAND_SEEK_TO_PREVIOUS,
      Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> "previous"
      else -> null
    }
    if (skip != null) {
      if (!CarAutoModule.deliverTransport(skip, parkWhenCold = true)) {
        ReactHostBoot.ensureJsRuntime(appContext)
      }
      return Futures.immediateVoidFuture()
    }
    if (seekCommand == Player.COMMAND_SEEK_TO_MEDIA_ITEM) {
      CarAutoModule.deliverTransport("seekToIndex", mediaItemIndex.toDouble())
    } else {
      playback = playback.copy(positionMs = positionMs)
      positionAt = System.currentTimeMillis()
      CarAutoModule.deliverTransport("seek", positionMs.toDouble())
    }
    return Futures.immediateVoidFuture()
  }

  override fun handleSetShuffleModeEnabled(shuffleModeEnabled: Boolean): ListenableFuture<*> {
    CarAutoModule.deliverTransport("shuffle", if (shuffleModeEnabled) 1.0 else 0.0)
    return Futures.immediateVoidFuture()
  }

  override fun handleSetRepeatMode(repeatMode: Int): ListenableFuture<*> {
    val value = when (repeatMode) {
      Player.REPEAT_MODE_ONE -> "one"
      Player.REPEAT_MODE_ALL -> "all"
      else -> "off"
    }
    CarAutoModule.deliverTransport("repeat", stringValue = value)
    return Futures.immediateVoidFuture()
  }

  private companion object {
    const val SEEK_TOLERANCE_MS = 1_500L
    const val METADATA_VALUE_ATTRIBUTE_PRESENT = 1L
    const val KEY_SUBTITLE_LINK_MEDIA_ID = "androidx.car.app.mediaextensions.KEY_SUBTITLE_LINK_MEDIA_ID"
  }
}
