package expo.modules.carauto

import android.util.Log

/**
 * Single Logcat entry point for the Android Auto module. Calls go through
 * here so verbose tracing can be flipped on/off without touching every site.
 * Set `verbose = true` while debugging the browse/play flow — JS does so in a
 * dev build — or `adb shell setprop log.tag.CarAuto D` to trace a release
 * build, which is the only kind that can boot headless.
 */
object CarAutoLog {
  private const val TAG = "CarAuto"
  var verbose: Boolean = false

  val enabled: Boolean
    get() = verbose || Log.isLoggable(TAG, Log.DEBUG)

  fun d(msg: String) {
    if (enabled) Log.d(TAG, msg)
  }

  fun w(msg: String, t: Throwable? = null) {
    if (t != null) Log.w(TAG, msg, t) else Log.w(TAG, msg)
  }
}
