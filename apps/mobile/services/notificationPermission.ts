import type { NotificationPermissionResult } from "@/services/notificationPermission.types";

export const notificationPermissionIsRuntime = false;

export async function requestPostNotifications(): Promise<NotificationPermissionResult> {
  return "blocked";
}
