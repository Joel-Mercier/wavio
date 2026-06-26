package com.jmercier.wavio.widget

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

// Invisible (translucent, finishes immediately) target of the widget play
// button. Activity launches are always permitted from a widget click, unlike
// background activity starts from a BroadcastReceiver (blocked on Android 14+).
// When the JS runtime is alive we just toggle in place; when the app is dead we
// deep-link into it so it boots and starts playback.
class WidgetPlayTrampolineActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val emitted = WavioWidgetModule.emitControl("play_pause")
        if (!emitted) {
            val launch = Intent(Intent.ACTION_VIEW, Uri.parse("wavio://play")).apply {
                setPackage(packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            startActivity(launch)
        }
        finish()
    }
}
