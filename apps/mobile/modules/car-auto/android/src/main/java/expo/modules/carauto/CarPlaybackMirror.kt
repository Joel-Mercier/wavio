package expo.modules.carauto

import androidx.annotation.OptIn
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi

/**
 * Process-wide snapshot of what JS last pushed, recorded whether or not the
 * browser service exists yet.
 *
 * The service is created when a car host binds it, routinely long after
 * playback started, and JS pushes on change, never twice. A session that came
 * up empty would have media3 drop every transport command before our handlers
 * see it (issue #161), so a freshly created player is seeded from here.
 */
@OptIn(UnstableApi::class)
object CarPlaybackMirror {
  data class Buttons(
    val favorite: Boolean?,
    val shuffle: Boolean,
    val repeat: Boolean,
    val radio: Boolean,
    val longForm: Boolean,
  )

  @Volatile private var nowPlaying: JsProxyPlayer.NowPlaying? = null
  @Volatile private var queue: List<JsProxyPlayer.NowPlaying> = emptyList()
  @Volatile private var queueIndex: Int = 0
  @Volatile private var playback: JsProxyPlayer.PlaybackState? = null
  @Volatile var error: PlaybackException? = null
    private set
  @Volatile var buttons = Buttons(null, shuffle = true, repeat = true, radio = false, longForm = false)
    private set

  val hasContent: Boolean
    get() = nowPlaying != null || queue.isNotEmpty()

  val currentArtist: Pair<String, String>?
    get() = nowPlaying?.let { np ->
      val id = np.artistMediaId ?: return@let null
      val name = np.artist ?: return@let null
      id to name
    }

  fun setNowPlaying(np: JsProxyPlayer.NowPlaying?) {
    nowPlaying = np
    if (np == null) playback = playback?.copy(playing = false, positionMs = 0L)
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

  fun setPlaybackState(state: JsProxyPlayer.PlaybackState) {
    playback = state
  }

  fun setButtons(next: Buttons) {
    buttons = next
  }

  fun setError(next: PlaybackException?) {
    error = next
  }

  fun seed(player: JsProxyPlayer) {
    if (hasContent) {
      val q = queue
      if (q.isNotEmpty()) player.applyQueue(q, queueIndex)
      nowPlaying?.let { player.applyNowPlaying(it) }
      playback?.let { player.applyPlaybackState(it) }
    }
    error?.let { player.applyError(it) }
  }

  fun repeatModeOf(value: String?): Int = when (value) {
    "one" -> Player.REPEAT_MODE_ONE
    "all" -> Player.REPEAT_MODE_ALL
    else -> Player.REPEAT_MODE_OFF
  }
}
