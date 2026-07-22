import * as Device from "expo-device";
import type { GithubReleaseAsset } from "@/services/appUpdate/types";

// Release APKs are named `wavio-<version>-<abi>.apk`, one per ABI. Preference
// order: a 64-bit device also lists armeabi-v7a in supportedCpuArchitectures, so
// arm64-v8a must be tried first to avoid handing it the 32-bit build.
const ABI_PREFERENCE = ["arm64-v8a", "armeabi-v7a"] as const;

// Picks the APK asset matching the device's CPU architecture, most-capable
// first. Returns null when no supported ABI has a matching asset (e.g. an x86
// emulator, or a release that only shipped one arch) — the caller then falls
// back to opening the releases page in the browser.
export function pickApkAsset(
  assets: GithubReleaseAsset[],
): GithubReleaseAsset | null {
  const supported = Device.supportedCpuArchitectures ?? [];
  const apks = assets.filter((a) => a.name.toLowerCase().endsWith(".apk"));

  for (const abi of ABI_PREFERENCE) {
    if (!supported.includes(abi)) continue;
    const match = apks.find((a) => a.name.toLowerCase().includes(abi));
    if (match) return match;
  }
  return null;
}
