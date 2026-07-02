package com.jmercier.wavio.widget

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
import com.bumptech.glide.load.resource.bitmap.CircleCrop
import com.bumptech.glide.load.resource.bitmap.RoundedCorners
import com.jmercier.wavio.R
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
            this.action = "com.jmercier.wavio.WIDGET_ACTION"
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
        onReady: (android.graphics.Bitmap?) -> Unit
    ) {
        if (url.isNullOrEmpty()) {
            onReady(null)
            return
        }
        executor.execute {
            val bmp = try {
                var request = Glide.with(ctx.applicationContext).asBitmap().load(url)
                if (circle) {
                    request = request.transform(CircleCrop())
                } else if (rounded) {
                    val radius = (8 * ctx.resources.displayMetrics.density).toInt()
                    request = request.transform(RoundedCorners(radius))
                }
                request.submit(256, 256).get()
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
            loadCoverAsync(ctx, WidgetState.getNowPlaying(ctx).coverUrl) { bmp ->
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
            loadCoverAsync(ctx, WidgetState.getNowPlaying(ctx).coverUrl) { bmp ->
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
