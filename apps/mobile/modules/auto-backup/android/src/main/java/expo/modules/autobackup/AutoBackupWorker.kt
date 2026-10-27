package expo.modules.autobackup

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.withTimeoutOrNull

class AutoBackupWorker(
  context: Context,
  params: WorkerParameters,
) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    AutoBackupScheduler.scheduleNextFromWorker(applicationContext)
    if (AutoBackupState.isPending(applicationContext)) {
      withTimeoutOrNull(RUN_TIMEOUT_MS) { AutoBackupRun.run(applicationContext) }
    }
    // Always success, even on timeout: see scheduleNextFromWorker. A failed
    // backup leaves `pending` raised, so the next day's run tries again.
    return Result.success()
  }

  private companion object {
    // Well inside WorkManager's 10-minute execution budget.
    const val RUN_TIMEOUT_MS = 5 * 60_000L
  }
}
