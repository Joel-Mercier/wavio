package com.jmercier.wavio.widget

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
            list.add(RecentItem(id, title, coverUrl))
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
