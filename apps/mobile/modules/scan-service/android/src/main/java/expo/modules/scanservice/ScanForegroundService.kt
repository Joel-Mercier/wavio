package expo.modules.scanservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder

/**
 * Keeps the process alive for the duration of a library scan.
 *
 * A first scan of a network share reads the tag region of every file on it, which
 * on a real library is minutes, not seconds. Backgrounding the app during that
 * suspends the JS context and the scan simply stops — and because the scanner's
 * prune step is guarded on a complete walk, nothing is lost but nothing finishes
 * either: the library stays quietly partial until the user happens to rescan.
 *
 * This service exists only to hold the process. It runs no scan logic itself —
 * the scan is JS, driven by services/local/indexer.ts — so there is no binder
 * interface and nothing to coordinate; start it before a scan, stop it after.
 */
class ScanForegroundService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Scanning library"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: ""
    startForeground(NOTIFICATION_ID, buildNotification(title, text))
    // NOT_STICKY: if the OS kills us, the JS scan died with the process anyway.
    // Restarting the service alone would show a notification with nothing behind
    // it. The foreground resume in app/_layout.tsx is what picks the scan back up.
    return START_NOT_STICKY
  }

  private fun buildNotification(title: String, text: String): Notification {
    ensureChannel()
    // Tapping the notification returns to the app rather than doing nothing.
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pending = launch?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    return builder
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .setOngoing(true)
      .setContentIntent(pending)
      .build()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    // LOW: no sound, no heads-up. The scan is background work the user started;
    // it needs to be visible (the platform requires it) but not intrusive.
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Library scan",
      NotificationManager.IMPORTANCE_LOW,
    )
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  companion object {
    private const val CHANNEL_ID = "wavio-library-scan"
    private const val NOTIFICATION_ID = 4711
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
  }
}
