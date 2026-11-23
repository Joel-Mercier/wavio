package expo.modules.releasepush

import android.content.Context
import android.content.Intent
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ReleasePushModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ReleasePush")

    Events("updateTapped")

    Function("configure") {
        enabled: Boolean,
        title: String,
        body: String,
        channelName: String,
        latestReleaseUrl: String,
      ->
      ReleasePush.configure(context, enabled, title, body, channelName, latestReleaseUrl)
    }

    Function("markSeen") { version: String ->
      ReleaseNotifier.markSeen(context, version)
    }

    Function("areNotificationsEnabled") {
      ReleaseNotifier.areNotificationsEnabled(context)
    }

    // A cold start delivers the tap in the launch intent, read here once JS asks.
    Function("consumeTappedVersion") {
      takeTap(appContext.currentActivity?.intent)
      pendingTap.also { pendingTap = null }
    }

    OnNewIntent { intent ->
      if (takeTap(intent)) sendEvent("updateTapped", emptyMap<String, Any>())
    }
  }

  private fun takeTap(intent: Intent?): Boolean {
    if (intent == null) return false
    val version = intent.getStringExtra(ReleaseNotifier.EXTRA_VERSION) ?: return false
    intent.removeExtra(ReleaseNotifier.EXTRA_VERSION)
    // Reopening from recents replays the original intent; that isn't a tap.
    if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) return false
    pendingTap = version
    return true
  }

  private companion object {
    @Volatile var pendingTap: String? = null
  }
}
