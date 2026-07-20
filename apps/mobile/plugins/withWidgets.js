const fs = require("node:fs");
const path = require("node:path");
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require("expo/config-plugins");

const PACKAGE = "com.jmercier.wavio";

// ---------- res/xml ----------

const WIDGET_NOW_PLAYING_INFO = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="60dp"
    android:minResizeWidth="180dp"
    android:minResizeHeight="60dp"
    android:resizeMode="horizontal"
    android:updatePeriodMillis="0"
    android:widgetCategory="home_screen"
    android:initialLayout="@layout/widget_now_playing"
    android:previewImage="@mipmap/ic_launcher" />
`;

const WIDGET_RECENT_INFO = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="130dp"
    android:minResizeWidth="180dp"
    android:minResizeHeight="130dp"
    android:resizeMode="horizontal|vertical"
    android:updatePeriodMillis="0"
    android:widgetCategory="home_screen"
    android:initialLayout="@layout/widget_recent"
    android:previewImage="@mipmap/ic_launcher" />
`;

// ---------- res/layout ----------

const TOP_STRIP_XML = `
    <LinearLayout
        android:id="@+id/top_strip"
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1"
        android:orientation="horizontal"
        android:paddingStart="10dp"
        android:paddingEnd="10dp"
        android:paddingTop="6dp"
        android:paddingBottom="6dp"
        android:gravity="center_vertical">

        <ImageView
            android:id="@+id/cover"
            android:layout_width="wrap_content"
            android:layout_height="match_parent"
            android:adjustViewBounds="true"
            android:scaleType="fitCenter"
            android:contentDescription="@null"
            android:src="@mipmap/ic_launcher" />

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:layout_marginStart="10dp"
            android:orientation="vertical">

            <TextView
                android:id="@+id/title"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:textColor="#FFFFFF"
                android:textSize="14sp"
                android:textStyle="bold"
                android:singleLine="true"
                android:ellipsize="end"
                android:text="@string/widget_empty_title" />

            <TextView
                android:id="@+id/artist"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:textColor="#CCFFFFFF"
                android:textSize="12sp"
                android:singleLine="true"
                android:ellipsize="end"
                android:text="@string/widget_empty_subtitle" />
        </LinearLayout>

        <ImageView
            android:id="@+id/logo"
            android:layout_width="18dp"
            android:layout_height="18dp"
            android:layout_marginStart="8dp"
            android:contentDescription="@null"
            android:src="@drawable/ic_widget_logo" />
    </LinearLayout>
`;

const CONTROLS_ROW_XML = `
    <LinearLayout
        android:id="@+id/controls"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center"
        android:paddingTop="0dp"
        android:paddingBottom="0dp">

        <ImageButton
            android:id="@+id/btn_prev"
            android:layout_width="28dp"
            android:layout_height="28dp"
            android:background="@android:color/transparent"
            android:src="@drawable/ic_widget_skip_previous"
            android:contentDescription="@null" />

        <ImageButton
            android:id="@+id/btn_play_pause"
            android:layout_width="32dp"
            android:layout_height="32dp"
            android:layout_marginStart="20dp"
            android:layout_marginEnd="20dp"
            android:background="@android:color/transparent"
            android:src="@drawable/ic_widget_play"
            android:contentDescription="@null" />

        <ImageButton
            android:id="@+id/btn_next"
            android:layout_width="28dp"
            android:layout_height="28dp"
            android:background="@android:color/transparent"
            android:src="@drawable/ic_widget_skip_next"
            android:contentDescription="@null" />
    </LinearLayout>
`;

const WIDGET_NOW_PLAYING_LAYOUT = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/root"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <ImageView
        android:id="@+id/bg"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:scaleType="fitXY"
        android:src="@drawable/widget_bg_shape"
        android:contentDescription="@null" />

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="vertical">
${TOP_STRIP_XML}
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:background="@drawable/widget_bottom_overlay">
${CONTROLS_ROW_XML}
        </LinearLayout>
    </LinearLayout>
</FrameLayout>
`;

function recentCellXml(idx) {
  return `
        <FrameLayout
            android:id="@+id/cell_${idx}"
            android:layout_width="0dp"
            android:layout_height="56dp"
            android:layout_weight="1"
            android:layout_marginEnd="${idx === 4 ? "0dp" : "6dp"}">
            <ImageView
                android:id="@+id/cover_${idx}"
                android:layout_width="56dp"
                android:layout_height="56dp"
                android:layout_gravity="center"
                android:scaleType="fitXY"
                android:contentDescription="@null" />
        </FrameLayout>
`;
}

const WIDGET_RECENT_LAYOUT = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/root"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <ImageView
        android:id="@+id/bg"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:scaleType="fitXY"
        android:src="@drawable/widget_bg_shape"
        android:contentDescription="@null" />

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="vertical">
${TOP_STRIP_XML}
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:background="@drawable/widget_bottom_overlay">
${CONTROLS_ROW_XML}
            <LinearLayout
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:weightSum="5"
                android:paddingStart="8dp"
                android:paddingEnd="8dp"
                android:paddingTop="6dp"
                android:paddingBottom="8dp">
${[0, 1, 2, 3, 4].map(recentCellXml).join("\n")}
            </LinearLayout>
        </LinearLayout>
    </LinearLayout>
</FrameLayout>
`;

// ---------- res/drawable ----------

const IC_WIDGET_LOGO = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
    <path
        android:strokeColor="#10B981"
        android:strokeWidth="36"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:pathData="M96 164 C144 132 208 132 256 164 C304 196 368 196 416 164" />
    <path
        android:strokeColor="#10B981"
        android:strokeWidth="36"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:pathData="M96 256 C144 224 208 224 256 256 C304 288 368 288 416 256" />
    <path
        android:strokeColor="#10B981"
        android:strokeWidth="36"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:pathData="M96 348 C144 316 208 316 256 348 C304 380 368 380 416 348" />
</vector>
`;

const IC_PLAY = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24"
    android:tint="#FFFFFF">
    <path android:fillColor="#FFFFFF" android:pathData="M8,5v14l11,-7z" />
</vector>
`;

const IC_PAUSE = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path android:fillColor="#FFFFFF" android:pathData="M6,5h4v14H6zM14,5h4v14h-4z" />
</vector>
`;

const IC_PREV = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path android:fillColor="#FFFFFF" android:pathData="M6,6h2v12H6zM9.5,12l8.5,6L18,6z" />
</vector>
`;

const IC_NEXT = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path android:fillColor="#FFFFFF" android:pathData="M6,18l8.5,-6L6,6zM16,6h2v12h-2z" />
</vector>
`;

const IC_HEART = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M12,21.35l-1.45,-1.32C5.4,15.36 2,12.28 2,8.5 2,5.42 4.42,3 7.5,3c1.74,0 3.41,0.81 4.5,2.09C13.09,3.81 14.76,3 16.5,3 19.58,3 22,5.42 22,8.5c0,3.78 -3.4,6.86 -8.55,11.54L12,21.35z" />
</vector>
`;

// The Favorites shortcut has no cover art (in-app it's a blue→emerald gradient
// with a heart). RemoteViews can't draw a runtime gradient, but this layer-list
// reproduces it: a rounded gradient rectangle with the heart centered on top.
const WIDGET_FAVORITES = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <gradient
                android:startColor="#3B82F6"
                android:endColor="#10B981"
                android:angle="270" />
            <corners android:radius="8dp" />
        </shape>
    </item>
    <item
        android:width="24dp"
        android:height="24dp"
        android:gravity="center"
        android:drawable="@drawable/ic_widget_heart" />
</layer-list>
`;

const STRINGS = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="widget_empty_title">Wavio</string>
    <string name="widget_empty_subtitle">Tap to open</string>
</resources>
`;

const WIDGET_BG_SHAPE = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#FFFFFFFF" />
    <corners android:radius="20dp" />
</shape>
`;

const WIDGET_BOTTOM_OVERLAY = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#80000000" />
    <corners
        android:topLeftRadius="0dp"
        android:topRightRadius="0dp"
        android:bottomLeftRadius="20dp"
        android:bottomRightRadius="20dp" />
</shape>
`;

// ---------- Kotlin sources ----------

const KT_WIDGET_STATE = `package ${PACKAGE}.widget

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
`;

const KT_WIDGET_RENDERER = `package ${PACKAGE}.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.widget.RemoteViews
import com.bumptech.glide.Glide
import com.bumptech.glide.load.resource.bitmap.CenterCrop
import com.bumptech.glide.load.resource.bitmap.CircleCrop
import com.bumptech.glide.load.resource.bitmap.RoundedCorners
import ${PACKAGE}.R
import java.util.concurrent.Executors

object WidgetRenderer {
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    private fun piFlags(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        else
            PendingIntent.FLAG_UPDATE_CURRENT
    }

    private fun controlIntent(ctx: Context, action: String): PendingIntent {
        val intent = Intent(ctx, WidgetActionReceiver::class.java).apply {
            this.action = "${PACKAGE}.WIDGET_ACTION"
            putExtra("control", action)
            setPackage(ctx.packageName)
        }
        return PendingIntent.getBroadcast(
            ctx,
            action.hashCode(),
            intent,
            piFlags()
        )
    }

    private fun openAppIntent(ctx: Context, uri: String): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
            setPackage(ctx.packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        return PendingIntent.getActivity(
            ctx,
            uri.hashCode(),
            intent,
            piFlags()
        )
    }

    fun applyTopStrip(ctx: Context, views: RemoteViews) {
        val np = WidgetState.getNowPlaying(ctx)
        views.setInt(R.id.bg, "setColorFilter", np.bgColor)
        if (np.title.isNullOrEmpty()) {
            views.setTextViewText(R.id.title, ctx.getString(R.string.widget_empty_title))
            views.setTextViewText(R.id.artist, ctx.getString(R.string.widget_empty_subtitle))
            views.setImageViewResource(R.id.cover, R.mipmap.ic_launcher)
        } else {
            views.setTextViewText(R.id.title, np.title)
            views.setTextViewText(R.id.artist, np.artist ?: "")
        }
        views.setImageViewResource(
            R.id.btn_play_pause,
            if (np.isPlaying) R.drawable.ic_widget_pause else R.drawable.ic_widget_play
        )
        views.setOnClickPendingIntent(R.id.btn_prev, controlIntent(ctx, "prev"))
        views.setOnClickPendingIntent(R.id.btn_play_pause, controlIntent(ctx, "play_pause"))
        views.setOnClickPendingIntent(R.id.btn_next, controlIntent(ctx, "next"))
        val tapTarget = if (np.title.isNullOrEmpty()) "wavio://" else "wavio://player"
        views.setOnClickPendingIntent(R.id.top_strip, openAppIntent(ctx, tapTarget))
    }

    fun loadCoverAsync(
        ctx: Context,
        url: String?,
        circle: Boolean = false,
        rounded: Boolean = false,
        sizeDp: Int = 56,
        onReady: (android.graphics.Bitmap?) -> Unit
    ) {
        if (url.isNullOrEmpty()) {
            onReady(null)
            return
        }
        executor.execute {
            val bmp = try {
                val density = ctx.resources.displayMetrics.density
                val sizePx = (sizeDp * density).toInt()
                // Round proportionally (8dp at the 56dp tile size) so the shape is
                // baked into the bitmap and survives being displayed 1:1 (fitXY),
                // matching the favorites tile's 8dp corners.
                val radiusPx = (sizePx * 8f / 56f).toInt()
                var request = Glide.with(ctx.applicationContext).asBitmap().load(url)
                request = if (circle) {
                    request.transform(CircleCrop())
                } else if (rounded) {
                    request.transform(CenterCrop(), RoundedCorners(radiusPx))
                } else {
                    request
                }
                request.submit(sizePx, sizePx).get()
            } catch (e: Exception) {
                null
            }
            main.post { onReady(bmp) }
        }
    }

    fun updateNowPlayingWidget(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) {
            val views = RemoteViews(ctx.packageName, R.layout.widget_now_playing)
            applyTopStrip(ctx, views)
            mgr.updateAppWidget(id, views)
            loadCoverAsync(ctx, WidgetState.getNowPlaying(ctx).coverUrl, rounded = true, sizeDp = 128) { bmp ->
                if (bmp != null) {
                    val v2 = RemoteViews(ctx.packageName, R.layout.widget_now_playing)
                    applyTopStrip(ctx, v2)
                    v2.setImageViewBitmap(R.id.cover, bmp)
                    mgr.updateAppWidget(id, v2)
                }
            }
        }
    }

    fun updateRecentWidget(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        val cellIds = intArrayOf(R.id.cover_0, R.id.cover_1, R.id.cover_2, R.id.cover_3, R.id.cover_4)
        val frameIds = intArrayOf(R.id.cell_0, R.id.cell_1, R.id.cell_2, R.id.cell_3, R.id.cell_4)
        val recent = WidgetState.getRecent(ctx)
        for (id in ids) {
            val views = RemoteViews(ctx.packageName, R.layout.widget_recent)
            applyTopStrip(ctx, views)
            for (i in cellIds.indices) {
                if (i < recent.size) {
                    views.setOnClickPendingIntent(
                        frameIds[i],
                        openAppIntent(ctx, recent[i].uri)
                    )
                    if (recent[i].type == "favorites") {
                        views.setInt(cellIds[i], "setBackgroundResource", R.drawable.widget_favorites)
                    }
                } else {
                    views.setViewVisibility(frameIds[i], android.view.View.INVISIBLE)
                }
            }
            mgr.updateAppWidget(id, views)
            // Load now-playing cover
            loadCoverAsync(ctx, WidgetState.getNowPlaying(ctx).coverUrl, rounded = true, sizeDp = 128) { bmp ->
                if (bmp != null) {
                    val v2 = RemoteViews(ctx.packageName, R.layout.widget_recent)
                    applyTopStrip(ctx, v2)
                    v2.setImageViewBitmap(R.id.cover, bmp)
                    for (i in cellIds.indices) {
                        if (i < recent.size) {
                            v2.setOnClickPendingIntent(
                                frameIds[i],
                                openAppIntent(ctx, recent[i].uri)
                            )
                            if (recent[i].type == "favorites") {
                                v2.setInt(cellIds[i], "setBackgroundResource", R.drawable.widget_favorites)
                            }
                        } else {
                            v2.setViewVisibility(frameIds[i], android.view.View.INVISIBLE)
                        }
                    }
                    mgr.updateAppWidget(id, v2)
                }
            }
            // Load each recent cover
            for (i in cellIds.indices) {
                if (i >= recent.size) continue
                val pos = i
                val isArtist = recent[i].type == "artist"
                loadCoverAsync(ctx, recent[i].coverUrl, isArtist, !isArtist) { bmp ->
                    if (bmp != null) {
                        val v3 = RemoteViews(ctx.packageName, R.layout.widget_recent)
                        v3.setImageViewBitmap(cellIds[pos], bmp)
                        mgr.partiallyUpdateAppWidget(id, v3)
                    }
                }
            }
        }
    }
}
`;

const KT_NOW_PLAYING_PROVIDER = `package ${PACKAGE}.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context

class NowPlayingWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        WidgetRenderer.updateNowPlayingWidget(ctx, mgr, ids)
    }

    companion object {
        fun refreshAll(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, NowPlayingWidgetProvider::class.java))
            if (ids != null && ids.isNotEmpty()) {
                WidgetRenderer.updateNowPlayingWidget(ctx, mgr, ids)
            }
        }
    }
}
`;

const KT_RECENT_PROVIDER = `package ${PACKAGE}.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context

class RecentPlaysWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        WidgetRenderer.updateRecentWidget(ctx, mgr, ids)
    }

    companion object {
        fun refreshAll(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, RecentPlaysWidgetProvider::class.java))
            if (ids != null && ids.isNotEmpty()) {
                WidgetRenderer.updateRecentWidget(ctx, mgr, ids)
            }
        }
    }
}
`;

const KT_ACTION_RECEIVER = `package ${PACKAGE}.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class WidgetActionReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val action = intent.getStringExtra("control") ?: return
        WavioWidgetModule.emitControl(action)
    }
}
`;

const KT_MODULE = `package ${PACKAGE}.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class WavioWidgetModule(reactCtx: ReactApplicationContext) : ReactContextBaseJavaModule(reactCtx) {

    init {
        ctxRef = reactCtx
    }

    override fun getName(): String = "WavioWidget"

    @ReactMethod
    fun updateNowPlaying(payload: ReadableMap) {
        val ctx = reactApplicationContext.applicationContext
        val title = if (payload.hasKey("title") && !payload.isNull("title")) payload.getString("title") else null
        val artist = if (payload.hasKey("artist") && !payload.isNull("artist")) payload.getString("artist") else null
        val coverUrl = if (payload.hasKey("coverUrl") && !payload.isNull("coverUrl")) payload.getString("coverUrl") else null
        val isPlaying = payload.hasKey("isPlaying") && payload.getBoolean("isPlaying")
        val bgColor = if (payload.hasKey("bgColor") && !payload.isNull("bgColor")) payload.getInt("bgColor") else 0xFF000000.toInt()
        WidgetState.setNowPlaying(ctx, title, artist, coverUrl, isPlaying, bgColor)
        NowPlayingWidgetProvider.refreshAll(ctx)
        RecentPlaysWidgetProvider.refreshAll(ctx)
    }

    @ReactMethod
    fun setIsPlaying(isPlaying: Boolean) {
        val ctx = reactApplicationContext.applicationContext
        WidgetState.setIsPlaying(ctx, isPlaying)
        NowPlayingWidgetProvider.refreshAll(ctx)
        RecentPlaysWidgetProvider.refreshAll(ctx)
    }

    @ReactMethod
    fun updateRecent(items: ReadableArray) {
        val ctx = reactApplicationContext.applicationContext
        val list = mutableListOf<RecentItem>()
        for (i in 0 until items.size()) {
            val m = items.getMap(i) ?: continue
            val id = m.getString("id") ?: continue
            val title = m.getString("title") ?: ""
            val coverUrl = if (m.hasKey("coverUrl") && !m.isNull("coverUrl")) m.getString("coverUrl") else null
            val type = if (m.hasKey("type")) m.getString("type") ?: "" else ""
            val uri = if (m.hasKey("uri")) m.getString("uri") ?: "" else ""
            val target = if (uri.isNotEmpty()) uri else "wavio://albums/" + id
            list.add(RecentItem(id, title, coverUrl, type, target))
        }
        WidgetState.setRecent(ctx, list)
        RecentPlaysWidgetProvider.refreshAll(ctx)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // no-op: required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // no-op
    }

    companion object {
        @Volatile
        private var ctxRef: ReactApplicationContext? = null

        fun emitControl(action: String) {
            val ctx = ctxRef ?: return
            if (!ctx.hasActiveReactInstance()) return
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("WavioWidgetControl", action)
        }
    }
}
`;

const KT_PACKAGE = `package ${PACKAGE}.widget

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class WavioWidgetPackage : ReactPackage {
    override fun createNativeModules(reactCtx: ReactApplicationContext): List<NativeModule> =
        listOf(WavioWidgetModule(reactCtx))

    override fun createViewManagers(reactCtx: ReactApplicationContext): List<ViewManager<View, *>> =
        emptyList()
}
`;

// ---------- mods ----------

const writeFile = (dir, name, body) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), body);
};

const withWidgetResources = (config) =>
  withDangerousMod(config, [
    "android",
    async (cfg) => {
      const resRoot = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
      );

      writeFile(
        path.join(resRoot, "xml"),
        "widget_now_playing_info.xml",
        WIDGET_NOW_PLAYING_INFO,
      );
      writeFile(
        path.join(resRoot, "xml"),
        "widget_recent_info.xml",
        WIDGET_RECENT_INFO,
      );
      writeFile(
        path.join(resRoot, "layout"),
        "widget_now_playing.xml",
        WIDGET_NOW_PLAYING_LAYOUT,
      );
      writeFile(
        path.join(resRoot, "layout"),
        "widget_recent.xml",
        WIDGET_RECENT_LAYOUT,
      );
      writeFile(
        path.join(resRoot, "drawable"),
        "ic_widget_logo.xml",
        IC_WIDGET_LOGO,
      );
      writeFile(path.join(resRoot, "drawable"), "ic_widget_play.xml", IC_PLAY);
      writeFile(
        path.join(resRoot, "drawable"),
        "ic_widget_pause.xml",
        IC_PAUSE,
      );
      writeFile(
        path.join(resRoot, "drawable"),
        "ic_widget_skip_previous.xml",
        IC_PREV,
      );
      writeFile(
        path.join(resRoot, "drawable"),
        "ic_widget_skip_next.xml",
        IC_NEXT,
      );
      writeFile(
        path.join(resRoot, "drawable"),
        "ic_widget_heart.xml",
        IC_HEART,
      );
      writeFile(
        path.join(resRoot, "drawable"),
        "widget_favorites.xml",
        WIDGET_FAVORITES,
      );
      writeFile(path.join(resRoot, "values"), "widget_strings.xml", STRINGS);
      writeFile(
        path.join(resRoot, "drawable"),
        "widget_bg_shape.xml",
        WIDGET_BG_SHAPE,
      );
      writeFile(
        path.join(resRoot, "drawable"),
        "widget_bottom_overlay.xml",
        WIDGET_BOTTOM_OVERLAY,
      );

      const javaRoot = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        ...PACKAGE.split("."),
        "widget",
      );
      writeFile(javaRoot, "WidgetState.kt", KT_WIDGET_STATE);
      writeFile(javaRoot, "WidgetRenderer.kt", KT_WIDGET_RENDERER);
      writeFile(
        javaRoot,
        "NowPlayingWidgetProvider.kt",
        KT_NOW_PLAYING_PROVIDER,
      );
      writeFile(javaRoot, "RecentPlaysWidgetProvider.kt", KT_RECENT_PROVIDER);
      writeFile(javaRoot, "WidgetActionReceiver.kt", KT_ACTION_RECEIVER);
      writeFile(javaRoot, "WavioWidgetModule.kt", KT_MODULE);
      writeFile(javaRoot, "WavioWidgetPackage.kt", KT_PACKAGE);

      return cfg;
    },
  ]);

const ACTION = `${PACKAGE}.WIDGET_ACTION`;

const withWidgetManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults,
    );
    app.receiver = app.receiver ?? [];

    const upsertReceiver = (name, info, exported) => {
      const existing = app.receiver.find((r) => r.$["android:name"] === name);
      const node = existing ?? {};
      node.$ = {
        "android:name": name,
        "android:exported": exported ? "true" : "false",
      };
      node["intent-filter"] = info
        ? [
            {
              action: [
                {
                  $: {
                    "android:name": "android.appwidget.action.APPWIDGET_UPDATE",
                  },
                },
              ],
            },
          ]
        : [
            {
              action: [{ $: { "android:name": ACTION } }],
            },
          ];
      if (info) {
        node["meta-data"] = [
          {
            $: {
              "android:name": "android.appwidget.provider",
              "android:resource": info,
            },
          },
        ];
      } else {
        delete node["meta-data"];
      }
      if (!existing) app.receiver.push(node);
    };

    upsertReceiver(
      `${PACKAGE}.widget.NowPlayingWidgetProvider`,
      "@xml/widget_now_playing_info",
      true,
    );
    upsertReceiver(
      `${PACKAGE}.widget.RecentPlaysWidgetProvider`,
      "@xml/widget_recent_info",
      true,
    );
    upsertReceiver(`${PACKAGE}.widget.WidgetActionReceiver`, null, false);

    return cfg;
  });

const GLIDE_DEP = `implementation 'com.github.bumptech.glide:glide:4.16.0'`;

const withGlide = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes("com.github.bumptech.glide:glide")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies\s*\{/,
        (match) => `${match}\n    ${GLIDE_DEP}`,
      );
    }
    return cfg;
  });

const withRegisterPackage = (config) =>
  withMainApplication(config, (cfg) => {
    const importLine = `import ${PACKAGE}.widget.WavioWidgetPackage`;
    if (!cfg.modResults.contents.includes(importLine)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /(package [^\n]+\n)/,
        `$1\n${importLine}\n`,
      );
    }
    if (!cfg.modResults.contents.includes("add(WavioWidgetPackage())")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /\/\/ Packages that cannot be autolinked yet[^\n]*\n(\s*)\/\/ add\(MyReactNativePackage\(\)\)/,
        (match, indent) => `${match}\n${indent}add(WavioWidgetPackage())`,
      );
    }
    return cfg;
  });

module.exports = (config) => {
  config = withWidgetResources(config);
  config = withWidgetManifest(config);
  config = withGlide(config);
  config = withRegisterPackage(config);
  return config;
};
