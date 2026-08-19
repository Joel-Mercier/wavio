package expo.modules.carauto

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

data class BrowseNode(
  val id: String,
  val title: String,
  val subtitle: String?,
  val artworkUrl: String?,
  // The mirrored copy of [artworkUrl], when JS had one on disk. Preferred, but
  // it lives in the reclaimable cache dir while this tree's snapshot does not —
  // so [artworkUrl] stays around as the fallback. See CarArtwork.apply.
  val localArtworkUrl: String?,
  val playable: Boolean,
  val contentStyle: String?, // "list" | "grid" | null
)

object BrowseTreeCache {
  private const val SNAPSHOT_FILE = "carauto_tree.json"
  const val ROOT_ID = "root"

  @Volatile private var nodes: Map<String, List<BrowseNode>> = emptyMap()
  @Volatile private var loaded: Boolean = false
  // Tracks the last browsable parent the user opened in Android Auto. We use
  // this when forwarding a play event so JS can enqueue the whole collection
  // (album / playlist / home section) instead of just the tapped track.
  @Volatile private var lastBrowsedParent: String? = null

  /**
   * Swap in a tree pushed from JS, returning the parent ids whose children
   * actually changed, each with its new child count.
   *
   * The caller notifies the media session for those ids and no others: a browser
   * only re-reads children it is told about, and telling it about every parent on
   * every rebuild would have it re-query the whole tree for nothing. A parent
   * that disappeared counts as changed — its children are now empty.
   *
   * The counts come from here rather than from [getChildren] because that one
   * records `lastBrowsedParent` as a side effect, and a push is not a browse.
   */
  fun setFromJson(context: Context, json: String): Map<String, Int> {
    val parsed = parse(json) ?: return emptyMap()
    val previous = nodes
    nodes = parsed
    runCatching {
      File(context.filesDir, SNAPSHOT_FILE).writeText(json)
    }
    loaded = true
    return (previous.keys + parsed.keys)
      .filter { previous[it] != parsed[it] }
      .associateWith { (parsed[it] ?: emptyList()).size }
  }

  // Used by the service when JS hasn't pushed a tree yet this process
  // (e.g. Android Auto started the service standalone).
  fun loadFromDiskIfNeeded(context: Context) {
    if (loaded) return
    loaded = true
    runCatching {
      val file = File(context.filesDir, SNAPSHOT_FILE)
      if (file.exists()) parse(file.readText())?.let { nodes = it }
    }
  }

  fun getChildren(parentId: String): List<BrowseNode> {
    val children = nodes[parentId] ?: emptyList()
    // Remember the deepest parent that actually holds playable leaves; that's
    // the collection AA was browsing when the user tapped a track.
    if (children.any { it.playable }) lastBrowsedParent = parentId
    return children
  }

  // Side-effect-free counterpart to getChildren, for callers that only need the
  // size and must not disturb lastBrowsedParent (a subscription is not a browse).
  fun childCount(parentId: String): Int = nodes[parentId]?.size ?: 0

  fun lastBrowsedParent(): String? = lastBrowsedParent

  // Best-effort: if the tapped track lives in a known parent, return that
  // parent's id. Falls back to the last-browsed parent when the track isn't
  // resolvable from the cache (rare — happens during warmup). The JS side is
  // authoritative now (track mediaIds embed their parent), so this is only a
  // backstop for legacy ids without an embedded parent.
  fun findParentOf(childId: String): String? {
    for ((pid, list) in nodes) {
      if (list.any { it.id == childId }) return pid
    }
    return lastBrowsedParent
  }

  fun debugSummary(): String {
    val root = nodes[ROOT_ID]?.size ?: 0
    return "root=$root totalParents=${nodes.size}"
  }

  private fun parse(json: String): Map<String, List<BrowseNode>>? = try {
    val root = JSONObject(json)
    val nodesObj = root.optJSONObject("nodes") ?: return null
    val map = HashMap<String, List<BrowseNode>>(nodesObj.length())
    val keys = nodesObj.keys()
    while (keys.hasNext()) {
      val k = keys.next()
      val arr = nodesObj.optJSONArray(k) ?: continue
      map[k] = parseList(arr)
    }
    map
  } catch (_: Throwable) {
    null
  }

  private fun parseList(arr: JSONArray): List<BrowseNode> {
    val out = ArrayList<BrowseNode>(arr.length())
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      out.add(
        BrowseNode(
          id = o.optString("id"),
          title = o.optString("title"),
          subtitle = o.optString("subtitle").takeIf { it.isNotEmpty() },
          artworkUrl = o.optString("artworkUrl").takeIf { it.isNotEmpty() },
          localArtworkUrl = o.optString("localArtworkUrl").takeIf { it.isNotEmpty() },
          playable = o.optBoolean("playable", false),
          contentStyle = o.optString("contentStyle").takeIf { it.isNotEmpty() },
        )
      )
    }
    return out
  }
}
