package expo.modules.releasepush

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives the release workflow's data-only message, `{type: "release", version}`,
 * and builds the notification itself, so a push never boots JS. Other types are
 * ignored, which leaves room for new ones without breaking older installs.
 */
class ReleasePushService : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    if (message.data[KEY_TYPE] != TYPE_RELEASE) return
    val version = message.data[KEY_VERSION] ?: return
    ReleaseNotifier.notifyIfNewer(applicationContext, version)
  }

  override fun onNewToken(token: String) {
    ReleasePush.onNewToken(applicationContext)
  }

  private companion object {
    const val KEY_TYPE = "type"
    const val KEY_VERSION = "version"
    const val TYPE_RELEASE = "release"
  }
}
