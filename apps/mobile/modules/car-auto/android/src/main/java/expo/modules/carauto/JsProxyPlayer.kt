package expo.modules.carauto

import android.content.Context
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

  // Cheap cursor move within the already-mirrored queue, so a track skip
  // doesn't need the whole track list re-pushed from JS.
  fun applyQueueIndex(index: Int) = runOnMain {
    if (queue.isEmpty()) return@runOnMain
    currentIndex = index.coerceIn(0, queue.size - 1)
    queue.getOrNull(currentIndex)?.let { nowPlaying = it }
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

    // Embed local cover art as bytes so AA's Now Playing / queue / home card
    // can render file:// artwork its host process can't read. The whole queue
    // travels in one player-state transaction, so cap how much art we embed:
    // the current item always gets it (the big Now Playing art), and the rest
    // are embedded in order until a byte budget is hit, after which they fall
    // back to the (host-unreadable for local, but tiny) uri. Keeps the timeline
    // under the binder transaction limit for very large local queues.
    val builder = ImmutableList.builder<MediaItemData>()
    var artBudget = ART_BUDGET_BYTES
    val occurrences = mutableMapOf<String, Int>()
    for ((i, item) in source.withIndex()) {
      val isCurrent = i == activeIndex
      val embed = isCurrent || artBudget > 0
      val occurrence = occurrences[item.id] ?: 0
      occurrences[item.id] = occurrence + 1
      val used = item.toMediaItemDataInto(builder, occurrence, embed)
      if (!isCurrent) artBudget -= used
    }
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

  // Builds the timeline item and appends it to [out]. Returns the number of
  // embedded artwork bytes so the caller can budget the player-state binder
  // transaction; when [embed] is false the art falls back to its uri.
  //
  // [occurrence] is how many times this track id already appeared earlier in the
  // queue, and only exists to make the MediaItemData UID unique: SimpleBasePlayer
  // rejects a playlist with a duplicate UID, and a queue legitimately holds the
  // same track twice (a playlist with a repeated song, a track queued again).
  // Counting occurrences rather than using the plain index keeps the UID stable
  // across queue edits — media3 diffs states by UID, so a positional one would
  // report a media-item transition (resetting the head unit's Now Playing) every
  // time an *earlier* entry was removed or reordered mid-track. The media id
  // stays the plain track id, which is what play intents resolve against.
  private fun NowPlaying.toMediaItemDataInto(
    out: ImmutableList.Builder<MediaItemData>,
    occurrence: Int,
    embed: Boolean,
  ): Int {
    val metadata = MediaMetadata.Builder()
      .setTitle(title)
      .setArtist(artist)
      .setAlbumTitle(album)
      .setIsBrowsable(false)
      .setIsPlayable(true)
      .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
    // A single already-resolved value: session.ts hands us the mirrored file when
    // it has one and the server URL otherwise, so `apply` sorts it out by scheme.
    val used = CarArtwork.apply(metadata, artworkUrl, embed = embed)
    val mi = MediaItem.Builder()
      .setMediaId(id)
      .setMediaMetadata(metadata.build())
      .build()
    out.add(
      MediaItemData.Builder(if (occurrence == 0) id else "$id#$occurrence")
        .setMediaItem(mi)
        .setDurationUs(if (durationMs > 0) durationMs * 1000 else C.TIME_UNSET)
        .build()
    )
    return used
  }

  private companion object {
    // Cap on embedded queue artwork per player-state push (~768KB), leaving
    // headroom under the ~1MB binder transaction limit for the rest of the
    // timeline (titles, ids, durations).
    const val ART_BUDGET_BYTES = 768 * 1024
  }

  override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
    val action = if (playWhenReady) "play" else "pause"
    // Nothing is loaded in a cold process, so only a play is worth acting on:
    // booting JS lets it rehydrate the persisted queue and start it (see
    // services/startupHydration.ts). A pause has nothing to pause and is dropped.
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
    // Like handleSetPlayWhenReady: `instance != null` is not enough, JS only
    // listens from notifyReady on. Skips against the restored queue still make
    // sense cold, so they are parked and boot the runtime; a position seek or a
    // jump to a queue index targets a timeline the cold process doesn't have.
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
      CarAutoModule.deliverTransport("seek", positionMs.toDouble())
    }
    return Futures.immediateVoidFuture()
  }

  override fun handleSetShuffleModeEnabled(shuffleModeEnabled: Boolean): ListenableFuture<*> {
    // Dropped when cold: the car is showing the proxy's default (off), so
    // replaying the toggle after boot could invert the user's persisted setting.
    CarAutoModule.deliverTransport("shuffle", if (shuffleModeEnabled) 1.0 else 0.0)
    return Futures.immediateVoidFuture()
  }

  override fun handleSetRepeatMode(repeatMode: Int): ListenableFuture<*> {
    val v = when (repeatMode) {
      Player.REPEAT_MODE_ONE -> "one"
      Player.REPEAT_MODE_ALL -> "all"
      else -> "off"
    }
    CarAutoModule.deliverTransport("repeat", stringValue = v)
    return Futures.immediateVoidFuture()
  }
}
