package expo.modules.wearbridge

import android.util.Log

internal object WearLog {
  private const val TAG = "WavioWear"

  fun d(message: String) {
    if (BuildConfig.DEBUG) Log.d(TAG, message)
  }

  fun w(message: String, error: Throwable? = null) {
    if (BuildConfig.DEBUG) Log.w(TAG, message, error)
  }
}
