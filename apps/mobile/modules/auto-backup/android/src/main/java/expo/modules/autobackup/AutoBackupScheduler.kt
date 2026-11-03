package expo.modules.autobackup

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.time.Duration
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

/**
 * One run per day at a user-chosen time of day.
 *
 * A one-shot request re-armed by each run rather than a PeriodicWorkRequest:
 * periodic work is anchored to when it was enqueued and drifts, so it can't
 * keep to a wall-clock time. Exact alarms could, but they need
 * SCHEDULE_EXACT_ALARM, which Play reserves for alarm and calendar apps. Doze
 * can still push a run to the next maintenance window, so the time is "at or
 * shortly after", which is all a backup needs.
 */
internal object AutoBackupScheduler {
  private const val WORK_NAME = "wavio-auto-backup"

  /**
   * Idempotent: JS calls this at every boot, including the headless boot a run
   * itself causes, and replacing then would cancel that very run. The work is
   * only replaced when the time actually changed.
   */
  fun schedule(context: Context, hour: Int, minute: Int) {
    val minuteOfDay = hour * 60 + minute
    val policy =
      if (AutoBackupState.minuteOfDay(context) == minuteOfDay) ExistingWorkPolicy.KEEP
      else ExistingWorkPolicy.REPLACE
    AutoBackupState.setMinuteOfDay(context, minuteOfDay)
    WorkManager.getInstance(context)
      .enqueueUniqueWork(WORK_NAME, policy, request(minuteOfDay))
  }

  /**
   * Called from inside the running worker. REPLACE would cancel the run doing
   * the enqueueing, so the next one is appended behind it instead; that is also
   * why the worker never reports failure, which would fail the appended run and
   * end the chain.
   */
  fun scheduleNextFromWorker(context: Context) {
    val minuteOfDay = AutoBackupState.minuteOfDay(context) ?: return
    WorkManager.getInstance(context).enqueueUniqueWork(
      WORK_NAME,
      ExistingWorkPolicy.APPEND_OR_REPLACE,
      request(minuteOfDay),
    )
  }

  fun cancel(context: Context) {
    AutoBackupState.setMinuteOfDay(context, null)
    WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
  }

  private fun request(minuteOfDay: Int): OneTimeWorkRequest =
    OneTimeWorkRequestBuilder<AutoBackupWorker>()
      .setInitialDelay(delayUntil(minuteOfDay), TimeUnit.MILLISECONDS)
      .setConstraints(
        Constraints.Builder()
          .setRequiresBatteryNotLow(true)
          .setRequiresStorageNotLow(true)
          .build(),
      )
      .build()

  // The one-minute margin keeps a run that finishes just before its own slot
  // from being re-armed for the same slot.
  internal fun delayUntil(minuteOfDay: Int, now: ZonedDateTime = ZonedDateTime.now()): Long {
    var next = now
      .withHour(minuteOfDay / 60)
      .withMinute(minuteOfDay % 60)
      .withSecond(0)
      .withNano(0)
    if (!next.isAfter(now.plusMinutes(1))) next = next.plusDays(1)
    return Duration.between(now, next).toMillis()
  }
}
