package com.jmercier.wavio.widget

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
