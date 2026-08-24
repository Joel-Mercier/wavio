package expo.modules.scanservice

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Start/stop switch for the scan foreground service.
 *
 * Copy is passed in from JS rather than built here so the notification is
 * localized by i18next like everything else the user reads — the native side has
 * no access to the selected locale.
 */
class ScanServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ScanService")

    Function("start") { title: String, text: String ->
      val context = appContext.reactContext ?: return@Function false
      val intent = Intent(context, ScanForegroundService::class.java).apply {
        putExtra(ScanForegroundService.EXTRA_TITLE, title)
        putExtra(ScanForegroundService.EXTRA_TEXT, text)
      }
      // startForegroundService, not startService: from API 26 a background start
      // of a service that then calls startForeground must use this, or the
      // system throws IllegalStateException. Wrapped because a start racing the
      // app going to the background still throws ForegroundServiceStartNot-
      // AllowedException on API 31+ — the scan itself is unaffected, it just
      // doesn't get the process-lifetime guarantee.
      runCatching { context.startForegroundService(intent) }.isSuccess
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function false
      runCatching {
        context.stopService(Intent(context, ScanForegroundService::class.java))
      }.isSuccess
    }

    // A scan can outlive the JS context but never the process; if the module is
    // being torn down there is nothing left to keep alive.
    OnDestroy {
      appContext.reactContext?.let {
        runCatching { it.stopService(Intent(it, ScanForegroundService::class.java)) }
      }
    }
  }
}
