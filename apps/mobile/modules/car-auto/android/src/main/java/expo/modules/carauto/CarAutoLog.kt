package expo.modules.carauto

import android.util.Log

/**
 * Single Logcat entry point for the Android Auto module. Calls go through
 * here so verbose tracing can be flipped on/off without touching every site.
 * Set `verbose = true` while debugging the browse/play flow.
 */
object CarAutoLog {
  private const val TAG = "CarAuto"
  var verbose: Boolean = false

  fun d(msg: String) {
    if (verbose) Log.d(TAG, msg)
  }

  fun w(msg: String, t: Throwable? = null) {
    if (t != null) Log.w(TAG, msg, t) else Log.w(TAG, msg)
  }
}
