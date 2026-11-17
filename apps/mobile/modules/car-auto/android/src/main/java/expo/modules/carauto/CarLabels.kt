package expo.modules.carauto

import android.content.Context
import org.json.JSONObject

/**
 * Localized strings for what native draws itself (player buttons, list-item
 * actions). Pushed by JS, which owns the app language, and persisted so a cold
 * bind labels its buttons before the runtime is up.
 */
object CarLabels {
  private const val PREFS = "carauto_labels"
  private const val KEY = "labels"

  @Volatile private var labels: Map<String, String> = emptyMap()
  @Volatile private var loaded = false

  private val FALLBACK = mapOf(
    "favoriteAdd" to "Add to favorites",
    "favoriteRemove" to "Remove from favorites",
    "shuffleOn" to "Turn shuffle on",
    "shuffleOff" to "Turn shuffle off",
    "repeatAll" to "Repeat all",
    "repeatOne" to "Repeat one",
    "repeatOff" to "Turn repeat off",
    "radio" to "Start radio",
    "seekBack" to "Back 30 seconds",
    "seekForward" to "Forward 30 seconds",
    "actionFavoriteAdd" to "Add to favorites",
    "actionFavoriteRemove" to "Remove from favorites",
    "actionRadio" to "Start radio",
    "actionPlayNext" to "Play next",
    "actionAddToQueue" to "Add to queue",
    "actionShuffle" to "Shuffle",
    "actionDownload" to "Download",
  )

  fun load(context: Context) {
    if (loaded) return
    loaded = true
    val json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
    if (json != null) labels = parse(json)
  }

  fun set(context: Context, json: String) {
    labels = parse(json)
    loaded = true
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
  }

  operator fun get(key: String): String = labels[key] ?: FALLBACK[key] ?: key

  private fun parse(json: String): Map<String, String> = runCatching {
    val o = JSONObject(json)
    o.keys().asSequence().associateWith { o.optString(it) }
  }.getOrDefault(emptyMap())
}
