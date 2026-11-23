package expo.modules.releasepush

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.Request
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Daily GitHub check for devices without Google Play services, where no push
 * can arrive. The first run waits a day because every launch already checks
 * from JS. A failed or rate-limited check simply waits for the next day.
 */
class ReleaseCheckWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    if (!ReleasePushSettings.isEnabled(applicationContext)) return Result.success()
    fetchLatestVersion()?.let { ReleaseNotifier.notifyIfNewer(applicationContext, it) }
    return Result.success()
  }

  private fun fetchLatestVersion(): String? {
    val url = ReleasePushSettings.latestReleaseUrl(applicationContext) ?: return null
    val request = Request.Builder()
      .url(url)
      .header("Accept", "application/vnd.github+json")
      .header("X-GitHub-Api-Version", "2022-11-28")
      .header("User-Agent", "Wavio/${ReleaseVersion.installed(applicationContext) ?: "0.0.0"}")
      .build()
    return try {
      OkHttpClientProvider.getOkHttpClient().newCall(request).execute().use { response ->
        if (!response.isSuccessful) return null
        val release = JSONObject(response.body?.string() ?: return null)
        if (release.optBoolean("draft") || release.optBoolean("prerelease")) return null
        release.optString("tag_name").removePrefix("v").takeIf { it.isNotEmpty() }
      }
    } catch (e: IOException) {
      Log.d(ReleasePush.TAG, "release check failed", e)
      null
    } catch (e: JSONException) {
      Log.d(ReleasePush.TAG, "release check got an unexpected payload", e)
      null
    }
  }

  companion object {
    private const val WORK_NAME = "wavio-release-check"

    fun schedule(context: Context) {
      val request = PeriodicWorkRequestBuilder<ReleaseCheckWorker>(1, TimeUnit.DAYS)
        .setInitialDelay(1, TimeUnit.DAYS)
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .build()
      WorkManager.getInstance(context)
        .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    fun cancel(context: Context) {
      WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
    }
  }
}
