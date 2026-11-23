package expo.modules.releasepush

import android.content.Context
import android.util.Log
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging

/**
 * Picks the delivery path for release notifications.
 *
 * With Google Play services and a Firebase config (GitHub builds), the FCM token
 * is subscribed to a topic the release workflow publishes to: one message per
 * release, whatever the number of installs. Without Play services, a daily
 * WorkManager check of GitHub stands in. Store builds ship no Firebase config,
 * so FirebaseApp never initializes there.
 *
 * Subscribe and unsubscribe are asynchronous, so each completion re-checks the
 * setting and undoes itself when the user toggled again in the meantime.
 */
internal object ReleasePush {
  const val TAG = "ReleasePush"
  private const val TOPIC = "releases"
  private const val TEST_TOPIC = "releases_test"
  private val TEST_VARIANT_SUFFIXES = listOf(".dev", ".preview")

  fun configure(
    context: Context,
    enabled: Boolean,
    title: String,
    body: String,
    channelName: String,
    latestReleaseUrl: String,
  ) {
    ReleasePushSettings.save(context, enabled, title, body, channelName, latestReleaseUrl)
    ReleaseNotifier.cancelIfInstalled(context)

    val fcm = canUseFcm(context)
    when {
      enabled && fcm -> {
        ReleaseCheckWorker.cancel(context)
        subscribe(context)
      }
      enabled -> {
        Log.i(TAG, "no Google Play services, daily GitHub check scheduled")
        ReleaseCheckWorker.schedule(context)
      }
      else -> {
        ReleaseCheckWorker.cancel(context)
        if (hasFirebase(context)) unsubscribe(context)
      }
    }
  }

  fun onNewToken(context: Context) {
    if (ReleasePushSettings.isEnabled(context) && canUseFcm(context)) subscribe(context)
  }

  fun canUseFcm(context: Context): Boolean =
    hasFirebase(context) &&
      GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS

  private fun hasFirebase(context: Context): Boolean = FirebaseApp.getApps(context).isNotEmpty()

  private fun topic(context: Context): String =
    if (TEST_VARIANT_SUFFIXES.any { context.packageName.endsWith(it) }) TEST_TOPIC else TOPIC

  private fun subscribe(context: Context) {
    val messaging = FirebaseMessaging.getInstance()
    messaging.isAutoInitEnabled = true
    val topic = topic(context)
    ReleasePushSettings.subscribedTopic(context)
      ?.takeIf { it != topic }
      ?.let { messaging.unsubscribeFromTopic(it) }
    messaging.subscribeToTopic(topic).addOnCompleteListener { task ->
      if (!task.isSuccessful) {
        Log.w(TAG, "subscribe to $topic failed, retried on next start", task.exception)
        return@addOnCompleteListener
      }
      Log.i(TAG, "subscribed to $topic")
      ReleasePushSettings.setSubscribedTopic(context, topic)
      if (!ReleasePushSettings.isEnabled(context)) unsubscribe(context)
    }
  }

  // With no recorded subscription, a token can still exist: subscribe() turns
  // auto-init on, which mints one, and its task may have failed or the process
  // died first. Auto-init on is the sign of that; otherwise FCM is left alone,
  // since unsubscribing would first create the token the setting avoids.
  private fun unsubscribe(context: Context) {
    val messaging = FirebaseMessaging.getInstance()
    val topic = ReleasePushSettings.subscribedTopic(context)
    if (topic == null) {
      if (messaging.isAutoInitEnabled) forgetToken(messaging)
      return
    }
    messaging.unsubscribeFromTopic(topic).addOnCompleteListener { task ->
      if (!task.isSuccessful) {
        Log.w(TAG, "unsubscribe from $topic failed, retried on next start", task.exception)
        return@addOnCompleteListener
      }
      Log.i(TAG, "unsubscribed from $topic")
      ReleasePushSettings.setSubscribedTopic(context, null)
      if (ReleasePushSettings.isEnabled(context)) {
        subscribe(context)
        return@addOnCompleteListener
      }
      forgetToken(messaging)
    }
  }

  private fun forgetToken(messaging: FirebaseMessaging) {
    messaging.isAutoInitEnabled = false
    messaging.deleteToken()
  }
}
