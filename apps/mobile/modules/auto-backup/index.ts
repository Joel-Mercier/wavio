import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

/**
 * The OS side of scheduled backups (services/autoBackup).
 *
 * Android schedules a daily WorkManager run at the chosen time; iOS submits a
 * BGProcessingTask whose `earliestBeginDate` is that time and lets the system
 * pick the slot. Either way the native side checks `pending` first and only
 * involves JS — booting it on Android if the process is cold — when something
 * was written since the last successful backup. JS then gets a `due` event and
 * must answer with `reportDone()`.
 *
 * `Native` is null on web, in Expo Go and in tests, so every call is guarded.
 */
type AutoBackupNative = {
  schedule(hour: number, minute: number): void;
  cancel(): void;
  setPending(pending: boolean): void;
  isPending(): boolean;
  notifyReady(): void;
  reportDone(): void;
  addListener(event: "due", listener: () => void): { remove: () => void };
};

const Native =
  Platform.OS === "web"
    ? null
    : requireOptionalNativeModule<AutoBackupNative>("AutoBackup");

export const isAutoBackupSchedulerAvailable = (): boolean => Native != null;

export function scheduleAutoBackup(hour: number, minute: number): void {
  Native?.schedule(hour, minute);
}

export function cancelAutoBackup(): void {
  Native?.cancel();
}

export function setAutoBackupPending(pending: boolean): void {
  Native?.setPending(pending);
}

export function isAutoBackupPending(): boolean {
  return Native?.isPending() ?? false;
}

export function onAutoBackupDue(listener: () => void): () => void {
  const sub = Native?.addListener("due", listener);
  return () => sub?.remove();
}

export function notifyAutoBackupReady(): void {
  Native?.notifyReady();
}

export function reportAutoBackupDone(): void {
  Native?.reportDone();
}
