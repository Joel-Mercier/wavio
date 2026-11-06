package expo.modules.httpstack

import android.content.Context
import android.content.SharedPreferences

/**
 * Native copy of the JS `http3Enabled` setting, read at `Application.onCreate`
 * so routing is decided before JS boots (Android Auto cold start).
 */
internal object Http3Settings {
  private const val PREFS = "wavio_http_stack"
  private const val KEY_ENABLED = "http3_enabled"
  private const val DEFAULT_ENABLED = false

  @Volatile private var prefs: SharedPreferences? = null
  @Volatile private var enabled = DEFAULT_ENABLED

  @Synchronized
  fun init(context: Context) {
    if (prefs != null) return
    val p = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    enabled = p.getBoolean(KEY_ENABLED, DEFAULT_ENABLED)
    prefs = p
  }

  fun isEnabled(): Boolean = enabled

  /** Returns whether the value changed. */
  fun setEnabled(value: Boolean): Boolean {
    if (enabled == value) return false
    enabled = value
    prefs?.edit()?.putBoolean(KEY_ENABLED, value)?.apply()
    return true
  }
}
