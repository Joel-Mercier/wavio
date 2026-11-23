import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

/**
 * Android side of release notifications (services/releasePush). The native
 * module owns delivery: an FCM topic push where Google Play services exist, a
 * daily GitHub check where they don't, and the notification itself, so neither
 * path boots JS. JS only mirrors the setting and the localized strings, and
 * hears about taps.
 *
 * `Native` is null on iOS, on web and in tests, so every call is guarded.
 */
type ReleasePushNative = {
  configure(
    enabled: boolean,
    title: string,
    body: string,
    channelName: string,
    latestReleaseUrl: string,
  ): void;
  markSeen(version: string): void;
  areNotificationsEnabled(): boolean;
  consumeTappedVersion(): string | null;
  addListener(
    event: "updateTapped",
    listener: () => void,
  ): { remove: () => void };
};

const Native =
  Platform.OS === "android"
    ? requireOptionalNativeModule<ReleasePushNative>("ReleasePush")
    : null;

export type ReleasePushConfig = {
  enabled: boolean;
  // "{version}" is replaced natively with the announced version.
  title: string;
  body: string;
  channelName: string;
  latestReleaseUrl: string;
};

export const isReleasePushAvailable = (): boolean => Native != null;

export function configureReleasePush(config: ReleasePushConfig): void {
  Native?.configure(
    config.enabled,
    config.title,
    config.body,
    config.channelName,
    config.latestReleaseUrl,
  );
}

export function markReleaseSeen(version: string): void {
  Native?.markSeen(version);
}

export function areNotificationsEnabled(): boolean {
  return Native?.areNotificationsEnabled() ?? false;
}

export function consumeTappedReleaseVersion(): string | null {
  return Native?.consumeTappedVersion() ?? null;
}

export function onReleaseNotificationTap(listener: () => void): () => void {
  const sub = Native?.addListener("updateTapped", listener);
  return () => sub?.remove();
}
