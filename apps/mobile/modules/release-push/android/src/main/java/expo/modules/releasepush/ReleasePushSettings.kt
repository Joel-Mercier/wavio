package expo.modules.releasepush

import android.content.Context
import android.content.SharedPreferences
import java.io.File

/**
 * Native copy of what JS configures, because a push or a fallback check arrives
 * with no JS running: the setting, the localized notification strings and the
 * release API address. Also what has already been notified and which topic the
 * FCM token is subscribed to.
 */
internal object ReleasePushSettings {
  private const val PREFS = "wavio-release-push"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_TITLE = "title"
  private const val KEY_BODY = "body"
  private const val KEY_CHANNEL_NAME = "channelName"
  private const val KEY_LATEST_RELEASE_URL = "latestReleaseUrl"
  private const val TOPIC_FILE = "release-push-topic"
  private const val KEY_LAST_NOTIFIED_VERSION = "lastNotifiedVersion"

  private const val DEFAULT_TITLE = "Wavio {version} is available"
  private const val DEFAULT_BODY = "Tap to see what's new and update"
  private const val DEFAULT_CHANNEL_NAME = "App updates"

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun save(
    context: Context,
    enabled: Boolean,
    title: String,
    body: String,
    channelName: String,
    latestReleaseUrl: String,
  ) {
    prefs(context).edit().apply {
      putBoolean(KEY_ENABLED, enabled)
      if (title.isNotBlank()) putString(KEY_TITLE, title)
      if (body.isNotBlank()) putString(KEY_BODY, body)
      if (channelName.isNotBlank()) putString(KEY_CHANNEL_NAME, channelName)
      if (latestReleaseUrl.isNotBlank()) putString(KEY_LATEST_RELEASE_URL, latestReleaseUrl)
    }.apply()
  }

  fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, false)

  fun title(context: Context): String =
    prefs(context).getString(KEY_TITLE, null) ?: DEFAULT_TITLE

  fun body(context: Context): String =
    prefs(context).getString(KEY_BODY, null) ?: DEFAULT_BODY

  fun channelName(context: Context): String =
    prefs(context).getString(KEY_CHANNEL_NAME, null) ?: DEFAULT_CHANNEL_NAME

  fun latestReleaseUrl(context: Context): String? =
    prefs(context).getString(KEY_LATEST_RELEASE_URL, null)

  // Describes this install's FCM token, so it stays out of Android's OS backup:
  // restored on a new phone, it would name a subscription that phone never made.
  private fun topicFile(context: Context) = File(context.noBackupFilesDir, TOPIC_FILE)

  fun subscribedTopic(context: Context): String? =
    topicFile(context).takeIf { it.exists() }?.readText()?.takeIf { it.isNotBlank() }

  fun setSubscribedTopic(context: Context, topic: String?) {
    val file = topicFile(context)
    if (topic == null) file.delete() else file.writeText(topic)
  }

  fun lastNotifiedVersion(context: Context): String? =
    prefs(context).getString(KEY_LAST_NOTIFIED_VERSION, null)

  fun setLastNotifiedVersion(context: Context, version: String) {
    prefs(context).edit().putString(KEY_LAST_NOTIFIED_VERSION, version).apply()
  }
}
