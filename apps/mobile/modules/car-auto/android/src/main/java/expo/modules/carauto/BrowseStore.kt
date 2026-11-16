package expo.modules.carauto

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

data class BrowseNode(
  val id: String,
  val title: String,
  val subtitle: String?,
  val artworkUrl: String?,
  val playable: Boolean,
  val browsable: Boolean,
  val childrenStyle: String?,
  val itemStyle: String?,
  val groupTitle: String?,
  val icon: String?,
  val actions: List<String>,
  val download: String?,
  val explicit: Boolean,
  val completion: Double?,
  val artFallback: String? = null,
)

/**
 * Children per parent, as JS answered them. A parent the host opens is served
 * from here at once; one JS hasn't answered within [FRESH_MS], or since the
 * car connected, is also refreshed from JS in the background
 * (stale-while-revalidate), and one missing entirely waits on JS (see
 * PendingRequests).
 *
 * Persisted so a cold bind — Android Auto starting the service with no JS yet —
 * has something to show while the runtime boots.
 */
object BrowseStore {
  const val ROOT_ID = "root"
  private const val SNAPSHOT_FILE = "carauto_browse_v2.json"
  private const val LEGACY_SNAPSHOT_FILE = "carauto_tree.json"
  private const val PERSISTED_PARENTS = 120
  private const val PERSIST_DELAY_MS = 2_000L
  private const val FRESH_MS = 5 * 60_000L

  private val lock = Any()
  private val children = LinkedHashMap<String, List<BrowseNode>>(64, 0.75f, true)
  private val raw = HashMap<String, String>()
  private val index = HashMap<String, BrowseNode>()
  private val parents = HashMap<String, String>()
  private val freshAt = HashMap<String, Long>()
  private val searches = LinkedHashMap<String, List<BrowseNode>>()
  @Volatile private var loaded = false
  @Volatile private var appContext: Context? = null

  private val mainHandler = Handler(Looper.getMainLooper())
  private val persistRunnable = Runnable { persistNow() }

  fun loadFromDiskIfNeeded(context: Context) {
    appContext = context.applicationContext
    if (loaded) return
    loaded = true
    runCatching { File(context.filesDir, LEGACY_SNAPSHOT_FILE).delete() }
    val json = runCatching { File(context.noBackupFilesDir, SNAPSHOT_FILE).readText() }.getOrNull() ?: return
    val nodes = runCatching { JSONObject(json).optJSONObject("nodes") }.getOrNull() ?: return
    synchronized(lock) {
      for (parentId in nodes.keys()) {
        val array = nodes.optJSONArray(parentId) ?: continue
        store(parentId, array.toString(), parseList(array))
      }
    }
  }

  /** Returns whether the children differ from what was stored. */
  fun put(parentId: String, json: String): Boolean {
    val list = runCatching { parseList(JSONArray(json)) }.getOrNull() ?: return false
    val changed = synchronized(lock) {
      freshAt[parentId] = SystemClock.elapsedRealtime()
      if (children[parentId] == list) return@synchronized false
      store(parentId, json, list)
      true
    }
    if (changed) schedulePersist()
    return changed
  }

  fun markFresh(parentId: String) = synchronized(lock) {
    freshAt[parentId] = SystemClock.elapsedRealtime()
  }

  fun invalidate(parentIds: List<String>?) = synchronized(lock) {
    if (parentIds == null) freshAt.clear() else parentIds.forEach { freshAt.remove(it) }
  }

  /** Drops everything, on disk too. Returns the parents that were stored. */
  fun clear(): List<String> {
    val dropped = synchronized(lock) {
      val ids = children.keys.toList()
      children.clear()
      raw.clear()
      index.clear()
      parents.clear()
      freshAt.clear()
      searches.clear()
      ids
    }
    mainHandler.removeCallbacks(persistRunnable)
    persistNow()
    return dropped
  }

  fun has(parentId: String): Boolean = synchronized(lock) { children.containsKey(parentId) }

  fun isFresh(parentId: String): Boolean = synchronized(lock) {
    val at = freshAt[parentId] ?: return@synchronized false
    SystemClock.elapsedRealtime() - at < FRESH_MS
  }

  fun getChildren(parentId: String): List<BrowseNode>? = synchronized(lock) { children[parentId] }

  fun childCount(parentId: String): Int = synchronized(lock) { children[parentId]?.size ?: 0 }

  fun find(mediaId: String): BrowseNode? = synchronized(lock) { index[mediaId] }

  fun putSearch(query: String, json: String?) {
    val list = json?.let { runCatching { parseList(JSONArray(it)) }.getOrNull() } ?: emptyList()
    synchronized(lock) {
      searches.remove(query)
      searches[query] = list
      while (searches.size > 8) searches.remove(searches.keys.first())
      for (node in list) index[node.id] = node
    }
  }

  fun getSearch(query: String): List<BrowseNode>? = synchronized(lock) { searches[query] }

  private fun store(parentId: String, json: String, list: List<BrowseNode>) {
    children[parentId]?.forEach { old ->
      if (parents[old.id] == parentId) {
        parents.remove(old.id)
        index.remove(old.id)
      }
    }
    children[parentId] = list
    raw[parentId] = json
    for (node in list) {
      index[node.id] = node
      parents[node.id] = parentId
    }
  }

  private fun schedulePersist() {
    mainHandler.removeCallbacks(persistRunnable)
    mainHandler.postDelayed(persistRunnable, PERSIST_DELAY_MS)
  }

  private fun persistNow() {
    val context = appContext ?: return
    val snapshot = synchronized(lock) {
      children.keys.toList().takeLast(PERSISTED_PARENTS).let { recent ->
        val keep = (recent + ROOT_ID).toSet()
        raw.filterKeys { it in keep }
      }
    }
    Thread {
      runCatching {
        val out = StringBuilder("{\"nodes\":{")
        var first = true
        for ((parentId, json) in snapshot) {
          if (!first) out.append(',')
          first = false
          out.append(JSONObject.quote(parentId)).append(':').append(json)
        }
        out.append("}}")
        val target = File(context.noBackupFilesDir, SNAPSHOT_FILE)
        val temp = File(context.noBackupFilesDir, "$SNAPSHOT_FILE.tmp")
        temp.writeText(out.toString())
        temp.renameTo(target)
      }.onFailure { CarAutoLog.w("browse snapshot write failed", it) }
    }.start()
  }

  private fun parseList(array: JSONArray): List<BrowseNode> {
    val out = ArrayList<BrowseNode>(array.length())
    for (i in 0 until array.length()) {
      val o = array.optJSONObject(i) ?: continue
      val id = o.optString("id")
      if (id.isEmpty()) continue
      val playable = o.optBoolean("playable", false)
      val actions = o.optJSONArray("actions")?.let { list ->
        (0 until list.length()).mapNotNull { list.optString(it).takeIf(String::isNotEmpty) }
      } ?: emptyList()
      out.add(
        BrowseNode(
          id = id,
          title = o.optString("title"),
          subtitle = o.optStringOrNull("subtitle"),
          artworkUrl = o.optStringOrNull("artworkUrl"),
          playable = playable,
          browsable = o.optBoolean("browsable", !playable),
          childrenStyle = o.optStringOrNull("childrenStyle"),
          itemStyle = o.optStringOrNull("itemStyle"),
          groupTitle = o.optStringOrNull("groupTitle"),
          icon = o.optStringOrNull("icon"),
          actions = actions,
          download = o.optStringOrNull("download"),
          explicit = o.optBoolean("explicit", false),
          completion = if (o.has("completion")) o.optDouble("completion") else null,
          artFallback = o.optStringOrNull("artFallback"),
        ),
      )
    }
    return out
  }
}

internal fun JSONObject.optStringOrNull(key: String): String? =
  if (isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }
