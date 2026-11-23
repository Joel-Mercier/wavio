package expo.modules.releasepush

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Posts the "new version" notification, shared by the FCM service and the
 * fallback worker. A version is announced once, and never when it isn't newer
 * than what is installed, so someone who already updated is never told to.
 */
internal object ReleaseNotifier {
  const val EXTRA_VERSION = "expo.modules.releasepush.VERSION"
  private const val CHANNEL_ID = "wavio-app-updates"
  private const val NOTIFICATION_ID = 4712
  private const val ACCENT = 0xFF10B981.toInt()

  @Synchronized
  fun notifyIfNewer(context: Context, version: String) {
    val skipped = when {
      !ReleasePushSettings.isEnabled(context) -> "setting off"
      !ReleaseVersion.isNewer(version, ReleaseVersion.installed(context)) -> "not newer than installed"
      wasAnnounced(context, version) -> "already announced"
      !areNotificationsEnabled(context) -> "notifications not allowed"
      else -> null
    }
    if (skipped != null) {
      Log.i(ReleasePush.TAG, "$version not announced: $skipped")
      return
    }
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    ensureChannel(context, manager)
    manager.notify(NOTIFICATION_ID, build(context, version))
    ReleasePushSettings.setLastNotifiedVersion(context, version)
    Log.i(ReleasePush.TAG, "$version announced")
  }

  /** The in-app dialog already showed this version, so a later check must not announce it again. */
  @Synchronized
  fun markSeen(context: Context, version: String) {
    ReleasePushSettings.setLastNotifiedVersion(context, version)
    context.getSystemService(NotificationManager::class.java)?.cancel(NOTIFICATION_ID)
  }

  fun cancelIfInstalled(context: Context) {
    val notified = ReleasePushSettings.lastNotifiedVersion(context) ?: return
    if (!ReleaseVersion.isNewer(notified, ReleaseVersion.installed(context))) {
      context.getSystemService(NotificationManager::class.java)?.cancel(NOTIFICATION_ID)
    }
  }

  fun areNotificationsEnabled(context: Context): Boolean =
    context.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled() ?: false

  // Exact match only: a test push of 99.0.0 must not hide every real release.
  private fun wasAnnounced(context: Context, version: String): Boolean {
    val last = ReleasePushSettings.lastNotifiedVersion(context) ?: return false
    return ReleaseVersion.parse(version) == ReleaseVersion.parse(last)
  }

  // Re-created on every post so a language change also renames the channel.
  private fun ensureChannel(context: Context, manager: NotificationManager) {
    manager.createNotificationChannel(
      NotificationChannel(
        CHANNEL_ID,
        ReleasePushSettings.channelName(context),
        NotificationManager.IMPORTANCE_DEFAULT,
      ),
    )
  }

  private fun build(context: Context, version: String): Notification {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      putExtra(EXTRA_VERSION, version)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    val pending = launch?.let {
      PendingIntent.getActivity(
        context,
        NOTIFICATION_ID,
        it,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    }
    return Notification.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.release_push_icon)
      .setColor(ACCENT)
      .setContentTitle(ReleasePushSettings.title(context).replace("{version}", version))
      .setContentText(ReleasePushSettings.body(context))
      .setAutoCancel(true)
      .setContentIntent(pending)
      .build()
  }
}
