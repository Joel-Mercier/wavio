package com.jmercier.wavio.wear.data

import org.json.JSONArray
import org.json.JSONObject

/**
 * Mirror of apps/mobile/services/wear/protocol.ts, which is the source of
 * truth. Keep the two in step when the protocol changes.
 *
 * Both sides must tolerate the other running a different version, so every
 * reader here defaults missing fields and ignores unknown ones rather than
 * failing. See the rules in protocol.ts.
 */
object Protocol {
  const val VERSION = 1

  const val PATH_STATE = "/wavio/v1/state"
  const val PATH_QUEUE = "/wavio/v1/queue"
  const val PATH_ARTWORK = "/wavio/v1/artwork"
  const val PATH_COMMAND = "/wavio/v1/command"
  const val PATH_PROGRESS = "/wavio/v1/progress"

  const val CAPABILITY_PHONE = "wavio_phone"

  const val KEY_JSON = "json"
  const val KEY_ARTWORK_KEY = "key"
  const val ASSET_ARTWORK = "artwork"

  fun command(action: String): String =
    JSONObject().put("v", VERSION).put("action", action).toString()

  fun command(action: String, value: Long): String =
    JSONObject().put("v", VERSION).put("action", action).put("value", value).toString()

  fun command(action: String, value: Boolean): String =
    JSONObject().put("v", VERSION).put("action", action).put("value", value).toString()

  fun command(action: String, value: String): String =
    JSONObject().put("v", VERSION).put("action", action).put("value", value).toString()

  fun hello(): String = JSONObject()
    .put("v", VERSION)
    .put("action", "hello")
    .put("protocolVersion", VERSION)
    .toString()
}

data class NowPlaying(
  val id: String,
  val title: String?,
  val artist: String?,
  val album: String?,
  val durationMs: Long,
)

data class PlayerState(
  /** False until the phone has told us anything at all. */
  val known: Boolean = false,
  val track: NowPlaying? = null,
  val artworkKey: String? = null,
  val isPlaying: Boolean = false,
  val shuffle: Boolean = false,
  val repeatMode: String = "off",
  val canSeek: Boolean = false,
  /** Position at [baseElapsedRealtime], already corrected for staleness. */
  val positionMs: Long = 0L,
  /** Watch-local `SystemClock.elapsedRealtime()` that [positionMs] refers to. */
  val baseElapsedRealtime: Long = 0L,
) {
  /**
   * Position right now, extrapolated locally. The watch never polls the phone
   * for this — it ticks its own clock forward and only rebases when a
   * correction arrives.
   */
  fun positionAt(nowElapsedRealtime: Long): Long {
    if (!isPlaying) return positionMs
    val duration = track?.durationMs ?: 0L
    val projected = positionMs + (nowElapsedRealtime - baseElapsedRealtime)
    return if (duration > 0L) projected.coerceIn(0L, duration) else projected.coerceAtLeast(0L)
  }
}

data class QueueEntry(val id: String, val title: String?, val artist: String?)

data class QueueState(
  val sig: String = "",
  val baseIndex: Int = 0,
  val currentIndex: Int = -1,
  val total: Int = 0,
  val tracks: List<QueueEntry> = emptyList(),
)

/**
 * Rebases a phone-sampled position onto the watch's own clock.
 *
 * A retained state item can be arbitrarily old — a watch waking after an hour
 * reads whatever was last written — so the sample's age has to be added back or
 * the ring would sit an hour behind. Wear OS keeps the watch clock synced to
 * the phone, which makes the wall-clock difference a usable staleness estimate;
 * it is clamped to the track duration so any surviving skew can't push the
 * position somewhere absurd.
 */
internal fun rebase(
  positionMs: Long,
  sentAtEpochMs: Long,
  isPlaying: Boolean,
  durationMs: Long,
  nowEpochMs: Long,
  nowElapsedRealtime: Long,
): Pair<Long, Long> {
  val ceiling = if (durationMs > 0L) durationMs else Long.MAX_VALUE / 4
  val staleness = if (isPlaying && sentAtEpochMs > 0L) {
    (nowEpochMs - sentAtEpochMs).coerceIn(0L, ceiling)
  } else {
    0L
  }
  val corrected = (positionMs + staleness).coerceIn(0L, ceiling)
  return corrected to nowElapsedRealtime
}

internal fun parseState(
  json: String,
  nowEpochMs: Long,
  nowElapsedRealtime: Long,
): PlayerState? {
  val o = runCatching { JSONObject(json) }.getOrNull() ?: return null
  val trackObj = o.optJSONObject("track")
  val track = trackObj?.let {
    NowPlaying(
      id = it.optString("id"),
      title = it.optString("title").takeIf { s -> s.isNotEmpty() },
      artist = it.optString("artist").takeIf { s -> s.isNotEmpty() },
      album = it.optString("album").takeIf { s -> s.isNotEmpty() },
      durationMs = it.optLong("durationMs", 0L),
    )
  }
  val isPlaying = o.optBoolean("isPlaying", false)
  val (position, base) = rebase(
    positionMs = o.optLong("positionMs", 0L),
    sentAtEpochMs = o.optLong("sentAtEpochMs", 0L),
    isPlaying = isPlaying,
    durationMs = track?.durationMs ?: 0L,
    nowEpochMs = nowEpochMs,
    nowElapsedRealtime = nowElapsedRealtime,
  )
  return PlayerState(
    known = true,
    track = track,
    artworkKey = o.optString("artworkKey").takeIf { it.isNotEmpty() },
    isPlaying = isPlaying,
    shuffle = o.optBoolean("shuffle", false),
    repeatMode = o.optString("repeatMode", "off").ifEmpty { "off" },
    canSeek = o.optBoolean("canSeek", false),
    positionMs = position,
    baseElapsedRealtime = base,
  )
}

internal fun parseQueue(json: String): QueueState? {
  val o = runCatching { JSONObject(json) }.getOrNull() ?: return null
  val arr: JSONArray = o.optJSONArray("tracks") ?: JSONArray()
  val tracks = ArrayList<QueueEntry>(arr.length())
  for (i in 0 until arr.length()) {
    val t = arr.optJSONObject(i) ?: continue
    tracks.add(
      QueueEntry(
        id = t.optString("id"),
        title = t.optString("title").takeIf { it.isNotEmpty() },
        artist = t.optString("artist").takeIf { it.isNotEmpty() },
      ),
    )
  }
  return QueueState(
    sig = o.optString("sig"),
    baseIndex = o.optInt("baseIndex", 0),
    currentIndex = o.optInt("currentIndex", -1),
    total = o.optInt("total", tracks.size),
    tracks = tracks,
  )
}
