package com.jmercier.wavio.widget

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

data class NowPlaying(
    val title: String?,
    val artist: String?,
    val coverUrl: String?,
    val isPlaying: Boolean,
    val bgColor: Int
)

data class RecentItem(
    val id: String,
    val title: String,
    val coverUrl: String?,
    val type: String,
    val uri: String
)

object WidgetState {
    private const val PREFS = "wavio_widget"
    private const val K_TITLE = "np_title"
    private const val K_ARTIST = "np_artist"
    private const val K_COVER = "np_cover"
    private const val K_PLAYING = "np_playing"
    private const val K_BG = "np_bg"
    private const val K_RECENT = "recent_json"

    private fun prefs(ctx: Context): SharedPreferences =
        ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun setNowPlaying(
        ctx: Context,
        title: String?,
        artist: String?,
        coverUrl: String?,
        isPlaying: Boolean,
        bgColor: Int
    ) {
        prefs(ctx).edit()
            .putString(K_TITLE, title)
            .putString(K_ARTIST, artist)
            .putString(K_COVER, coverUrl)
            .putBoolean(K_PLAYING, isPlaying)
            .putInt(K_BG, bgColor)
            .apply()
    }

    fun setIsPlaying(ctx: Context, isPlaying: Boolean) {
        prefs(ctx).edit().putBoolean(K_PLAYING, isPlaying).apply()
    }

    fun getNowPlaying(ctx: Context): NowPlaying {
        val p = prefs(ctx)
        return NowPlaying(
            title = p.getString(K_TITLE, null),
            artist = p.getString(K_ARTIST, null),
            coverUrl = p.getString(K_COVER, null),
            isPlaying = p.getBoolean(K_PLAYING, false),
            bgColor = p.getInt(K_BG, 0xFF000000.toInt())
        )
    }

    fun setRecent(ctx: Context, items: List<RecentItem>) {
        val arr = JSONArray()
        items.forEach {
            val o = JSONObject()
            o.put("id", it.id)
            o.put("title", it.title)
            o.put("coverUrl", it.coverUrl ?: JSONObject.NULL)
            o.put("type", it.type)
            o.put("uri", it.uri)
            arr.put(o)
        }
        prefs(ctx).edit().putString(K_RECENT, arr.toString()).apply()
    }

    fun getRecent(ctx: Context): List<RecentItem> {
        val raw = prefs(ctx).getString(K_RECENT, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                RecentItem(
                    id = o.optString("id"),
                    title = o.optString("title"),
                    coverUrl = if (o.isNull("coverUrl")) null else o.optString("coverUrl"),
                    type = o.optString("type"),
                    uri = o.optString("uri")
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }
}
