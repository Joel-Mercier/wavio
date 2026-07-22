import * as InAppUpdates from "expo-in-app-updates";
import { reportError } from "@/services/errorReporting";

// Store-distribution update path (Play Store now, App Store once iOS ships),
// backed by expo-in-app-updates: Android queries Play for an available update;
// iOS looks the version up via the iTunes API (needs ios.infoPlist.AppStoreID).

export async function isStoreUpdateAvailable(): Promise<boolean> {
  try {
    const result = await InAppUpdates.checkForUpdate();
    return result.updateAvailable;
  } catch (error) {
    reportError(error, {
      area: "api",
      endpoint: "inAppUpdates.checkForUpdate",
    });
    return false;
  }
}

// Launches the native update flow: Play's in-app-update overlay on Android, or
// the App Store listing on iOS. A flexible (non-blocking) update is requested so
// the user keeps control.
export async function startStoreUpdate(): Promise<void> {
  try {
    await InAppUpdates.startUpdate(false);
  } catch (error) {
    reportError(error, { area: "api", endpoint: "inAppUpdates.startUpdate" });
  }
}
