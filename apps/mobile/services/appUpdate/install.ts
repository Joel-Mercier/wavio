import type { File } from "expo-file-system";
import { getContentUriAsync } from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";

// Hands the downloaded APK to Android's system package installer. The installer
// requires a `content://` URI (a raw `file://` throws FileUriExposedException on
// API 24+), which getContentUriAsync produces via Expo's built-in FileProvider.
// FLAG_GRANT_READ_URI_PERMISSION (1) lets the installer read it. The user is
// prompted to allow "install unknown apps" the first time (backed by the
// REQUEST_INSTALL_PACKAGES permission, added to github builds via
// plugins/withInstallApkPermission).
export async function installApk(file: File): Promise<void> {
  const contentUri = await getContentUriAsync(file.uri);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    flags: 1,
    type: "application/vnd.android.package-archive",
  });
}
