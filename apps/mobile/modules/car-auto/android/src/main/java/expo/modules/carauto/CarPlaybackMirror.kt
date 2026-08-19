package expo.modules.carauto

import androidx.annotation.OptIn
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi

/**
 * Process-wide snapshot of what JS last said is playing.
 *
 * The mirror pushes from services/carAuto/session.ts only reach a player while
 * [WavioCarBrowserService] is alive, and that service is created when a car host
 * binds it — not when playback starts. So everything pushed before Android Auto
 * connected went nowhere, and because session.ts pushes the track and the queue
 * *on change*, it never repeated them: connecting the car mid-playback left the
 * session with an empty timeline for the rest of the process.
 *
 * That is fatal rather than cosmetic. media3 drops a skip inside `BasePlayer`
 * when the timeline is empty (so [JsProxyPlayer.handleSeek] never runs) and
 * routes a play request to `Callback.onPlaybackResumption` instead of the player
 * — every transport control in the car was dead until the track happened to
 * change on the phone (issue #161).
 *
 * Holding the last values here lets a freshly created player seed itself, the
 * same way [BrowseTreeCache] seeds the browse tree from disk. Deliberately
 * in-memory only: a cold process has no playback to mirror, and JS pushes the
 * real state within a second of booting.
 */
@OptIn(UnstableApi::class)
object CarPlaybackMirror {
  @Volatile private var nowPlaying: JsProxyPlayer.NowPlaying? = null
  @Volatile private var queue: List<JsProxyPlayer.NowPlaying> = emptyList()
  @Volatile private var queueIndex: Int = 0
  @Volatile private var playing: Boolean = false
  @Volatile private var positionMs: Long = 0L
  @Volatile private var shuffle: Boolean = false
  @Volatile private var repeatMode: Int = Player.REPEAT_MODE_OFF

  // Whether there is anything worth seeding a player with. A play arriving on an
  // empty session is the one case that still has to go through JS rehydration.
  val hasContent: Boolean
    get() = nowPlaying != null || queue.isNotEmpty()

  // Mirrors JsProxyPlayer.applyNowPlaying, clearing included: a null track stops
  // playback but leaves the queue alone, because JS pushes the two separately
  // and the queue push is what says the queue is gone.
  fun setNowPlaying(np: JsProxyPlayer.NowPlaying?) {
    nowPlaying = np
    if (np == null) {
      playing = false
      positionMs = 0L
    }
  }

  fun setQueue(items: List<JsProxyPlayer.NowPlaying>, index: Int) {
    queue = items
    queueIndex = index.coerceIn(0, (items.size - 1).coerceAtLeast(0))
    items.getOrNull(queueIndex)?.let { nowPlaying = it }
  }

  fun setQueueIndex(index: Int) {
    val q = queue
    if (q.isEmpty()) return
    queueIndex = index.coerceIn(0, q.size - 1)
    q.getOrNull(queueIndex)?.let { nowPlaying = it }
  }

  fun setPlaybackState(isPlaying: Boolean, posMs: Long, shuf: Boolean, repeat: Int) {
    playing = isPlaying
    positionMs = posMs.coerceAtLeast(0L)
    shuffle = shuf
    repeatMode = repeat
  }

  /**
   * Replay the snapshot into a newly created player, in the same order JS sends
   * it: the queue first (which points nowPlaying at the current entry), then the
   * now-playing push that may carry a more refined version of it, then the
   * transport state. The position is only ever ~1s stale — session.ts pulses
   * `setPlaybackState` every second whether a player is listening or not.
   */
  fun seed(player: JsProxyPlayer) {
    if (!hasContent) return
    val q = queue
    if (q.isNotEmpty()) player.applyQueue(q, queueIndex)
    nowPlaying?.let { player.applyNowPlaying(it) }
    player.applyPlaybackState(playing, positionMs, shuffle, repeatMode)
  }
}
