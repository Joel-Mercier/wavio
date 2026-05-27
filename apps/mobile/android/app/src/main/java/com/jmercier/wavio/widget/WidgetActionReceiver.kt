package com.jmercier.wavio.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class WidgetActionReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val action = intent.getStringExtra("control") ?: return
        WavioWidgetModule.emitControl(action)
    }
}
