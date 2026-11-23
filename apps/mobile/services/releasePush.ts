import { AppState, Linking, Platform } from "react-native";
import { isGithubDistribution } from "@/config/distribution";
import i18n from "@/config/i18n";
import {
  areNotificationsEnabled,
  configureReleasePush,
  consumeTappedReleaseVersion,
  isReleasePushAvailable,
  markReleaseSeen,
  onReleaseNotificationTap,
} from "@/modules/release-push";
import { latestReleaseApiUrl } from "@/services/appUpdate";
import {
  notificationPermissionIsRuntime,
  requestPostNotifications,
} from "@/services/notificationPermission";
import type { NotificationPermissionResult } from "@/services/notificationPermission.types";
import { useAppBase } from "@/stores/app";

// Only a side-loaded Android APK has a GitHub release to announce: the store
// builds ship no Firebase config and Play owns their updates.
export const releaseNotificationsSupported =
  isGithubDistribution && Platform.OS === "android" && isReleasePushAvailable();

function pushConfig() {
  configureReleasePush({
    enabled: useAppBase.getState().releaseNotificationsEnabled,
    title: i18n.t("app.update.notification.title", { version: "{version}" }),
    body: i18n.t("app.update.notification.body"),
    channelName: i18n.t("app.update.notification.channelName"),
    latestReleaseUrl: latestReleaseApiUrl,
  });
}

/**
 * Mirrors the setting and the notification copy to the native side, which
 * posts with no JS running. Pushes at every start (re-syncing the FCM topic
 * subscription), on every change of the setting, a backup restore included,
 * and on a language change.
 */
export function initReleasePush(): () => void {
  if (!releaseNotificationsSupported) return () => {};
  pushConfig();
  const unsubscribeStore = useAppBase.subscribe((state, previous) => {
    if (
      state.releaseNotificationsEnabled !== previous.releaseNotificationsEnabled
    ) {
      pushConfig();
    }
  });
  i18n.on("languageChanged", pushConfig);
  return () => {
    unsubscribeStore();
    i18n.off("languageChanged", pushConfig);
  };
}

export function noteReleaseSeen(version: string): void {
  if (releaseNotificationsSupported) markReleaseSeen(version);
}

/** Calls `listener` for a tap that launched the app, then for every later one. */
export function subscribeReleaseNotificationTaps(
  listener: (version: string) => void,
): () => void {
  if (!releaseNotificationsSupported) return () => {};
  const consume = () => {
    const version = consumeTappedReleaseVersion();
    if (version) listener(version);
  };
  consume();
  return onReleaseNotificationTap(consume);
}

/**
 * Whether to show the one-time explanation before Android 13+'s permission
 * dialog: the setting is on by default, but nothing can be posted until the
 * permission is granted. When no prompt is needed, it is recorded as handled so
 * revoking the permission later never brings it back.
 */
export function takeReleaseNotificationsPrompt(): boolean {
  if (!releaseNotificationsSupported) return false;
  const state = useAppBase.getState();
  if (state.releaseNotificationsPromptHandled) return false;
  if (
    state.releaseNotificationsEnabled &&
    notificationPermissionIsRuntime &&
    !areNotificationsEnabled()
  ) {
    return true;
  }
  state.setReleaseNotificationsPromptHandled(true);
  return false;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionResult> {
  if (areNotificationsEnabled()) return "granted";
  return requestPostNotifications();
}

/**
 * For a "blocked" permission, which only the system settings can lift: opens
 * them, and turns the setting on if notifications are allowed on the way back.
 */
export function enableReleaseNotificationsFromSystemSettings(): void {
  const subscription = AppState.addEventListener("change", (state) => {
    if (state !== "active") return;
    subscription.remove();
    if (areNotificationsEnabled()) {
      useAppBase.getState().setReleaseNotificationsEnabled(true);
    }
  });
  Linking.openSettings().catch(() => subscription.remove());
}
