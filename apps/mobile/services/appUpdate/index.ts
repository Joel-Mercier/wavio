import * as Application from "expo-application";
import { pickApkAsset } from "@/services/appUpdate/arch";
import { downloadApk } from "@/services/appUpdate/download";
import { fetchLatestRelease } from "@/services/appUpdate/github";
import { installApk } from "@/services/appUpdate/install";
import type {
  DownloadProgressHandler,
  GithubUpdate,
} from "@/services/appUpdate/types";
import { isNewer } from "@/services/appUpdate/version";

export { releasesPageUrl } from "@/services/appUpdate/github";
export {
  isStoreUpdateAvailable,
  startStoreUpdate,
} from "@/services/appUpdate/store";
export type { GithubUpdate } from "@/services/appUpdate/types";

// Checks GitHub for a release newer than the running version. Returns null when
// up to date, on any fetch failure, or when the version tag can't be parsed. A
// newer release with no APK matching this device's ABI still resolves (asset
// null) so the UI can offer the browser fallback (releasesPageUrl) instead of
// silently doing nothing.
export async function checkForGithubUpdate(): Promise<GithubUpdate | null> {
  const release = await fetchLatestRelease();
  if (!release) return null;

  const current = Application.nativeApplicationVersion;
  if (!isNewer(release.tag_name, current)) return null;

  return {
    version: release.tag_name.replace(/^v/, ""),
    release,
    asset: pickApkAsset(release.assets),
  };
}

// Downloads the update's APK and launches the system installer. Progress is
// reported as a 0..1 fraction; the returned promise resolves once the installer
// intent is fired (the OS then owns the install UI). Throws on download failure
// so the caller can offer a retry.
export async function downloadAndInstall(
  update: GithubUpdate,
  onProgress?: DownloadProgressHandler,
  signal?: AbortSignal,
): Promise<void> {
  if (!update.asset) throw new Error("No installable APK for this device");
  const file = await downloadApk(update.asset, onProgress, signal);
  await installApk(file);
}
