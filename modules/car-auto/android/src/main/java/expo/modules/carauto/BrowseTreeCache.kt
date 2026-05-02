package expo.modules.carauto

import org.json.JSONArray
import org.json.JSONObject

data class BrowseNode(
  val id: String,
  val title: String,
  val subtitle: String?,
  val artworkUrl: String?,
  val playable: Boolean,
)

object BrowseTreeCache {
  @Volatile private var recent: List<BrowseNode> = emptyList()
  @Volatile private var playlists: List<BrowseNode> = emptyList()
  @Volatile private var starred: List<BrowseNode> = emptyList()

  fun setFromJson(json: String) {
    try {
      val root = JSONObject(json)
      recent = parseList(root.optJSONArray("recent"))
      playlists = parseList(root.optJSONArray("playlists"))
      starred = parseList(root.optJSONArray("starred"))
    } catch (_: Throwable) {
      // Bad payload — keep last good snapshot.
    }
  }

  fun getSection(id: String): List<BrowseNode> = when (id) {
    SECTION_RECENT -> recent
    SECTION_PLAYLISTS -> playlists
    SECTION_STARRED -> starred
    else -> emptyList()
  }

  fun getRootSections(): List<BrowseNode> = listOf(
    BrowseNode(SECTION_RECENT, "Recently Played", null, null, false),
    BrowseNode(SECTION_PLAYLISTS, "Playlists", null, null, false),
    BrowseNode(SECTION_STARRED, "Starred", null, null, false),
  )

  private fun parseList(arr: JSONArray?): List<BrowseNode> {
    if (arr == null) return emptyList()
    val out = ArrayList<BrowseNode>(arr.length())
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      out.add(
        BrowseNode(
          id = o.optString("id"),
          title = o.optString("title"),
          subtitle = o.optString("subtitle").takeIf { it.isNotEmpty() },
          artworkUrl = o.optString("artworkUrl").takeIf { it.isNotEmpty() },
          playable = o.optBoolean("playable", false),
        )
      )
    }
    return out
  }

  const val ROOT_ID = "root"
  const val SECTION_RECENT = "section:recent"
  const val SECTION_PLAYLISTS = "section:playlists"
  const val SECTION_STARRED = "section:starred"
}
