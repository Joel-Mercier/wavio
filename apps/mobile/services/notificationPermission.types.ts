// "blocked": Android won't show its dialog again (or never had one, below 13),
// so only the system settings can turn notifications on.
export type NotificationPermissionResult = "granted" | "denied" | "blocked";
