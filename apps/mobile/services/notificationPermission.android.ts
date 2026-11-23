import { PermissionsAndroid, Platform } from "react-native";
import type { NotificationPermissionResult } from "@/services/notificationPermission.types";

export const notificationPermissionIsRuntime = Number(Platform.Version) >= 33;

export async function requestPostNotifications(): Promise<NotificationPermissionResult> {
  if (!notificationPermissionIsRuntime) return "blocked";
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );
  if (result === PermissionsAndroid.RESULTS.GRANTED) return "granted";
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return "blocked";
  return "denied";
}
