package expo.modules.autobackup

import android.content.Context

/**
 * Native-side state the worker reads before deciding whether JS is needed at
 * all. `pending` is raised by JS on the first backed-up write after a
 * successful backup and lowered when the next one succeeds, so a scheduled run
 * on a day the app wasn't used finishes without booting React Native.
 */
internal object AutoBackupState {
  private const val PREFS = "wavio_auto_backup"
  private const val KEY_PENDING = "pending"
  private const val KEY_MINUTE_OF_DAY = "minuteOfDay"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun isPending(context: Context): Boolean =
    prefs(context).getBoolean(KEY_PENDING, false)

  fun setPending(context: Context, pending: Boolean) {
    prefs(context).edit().putBoolean(KEY_PENDING, pending).apply()
  }

  fun minuteOfDay(context: Context): Int? =
    prefs(context).getInt(KEY_MINUTE_OF_DAY, -1).takeIf { it >= 0 }

  fun setMinuteOfDay(context: Context, minuteOfDay: Int?) {
    prefs(context).edit().apply {
      if (minuteOfDay == null) remove(KEY_MINUTE_OF_DAY)
      else putInt(KEY_MINUTE_OF_DAY, minuteOfDay)
    }.apply()
  }
}
