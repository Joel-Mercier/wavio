package com.jmercier.wavio.widget

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
