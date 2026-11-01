import * as Device from "expo-device";
import type { GithubReleaseAsset } from "@/services/appUpdate/types";

// Release APKs are named `wavio-<version>-<abi>.apk`, one per ABI. Preference
// order: an x86_64 device with ARM translation (ChromeOS, FydeOS) also lists the
// ARM ABIs, and a 64-bit ARM device also lists armeabi-v7a, so the native build
// must be tried before the ones it can merely emulate.
const ABI_PREFERENCE = ["x86_64", "arm64-v8a", "armeabi-v7a"] as const;

// Picks the APK asset matching the device's CPU architecture, most-capable
// first. Returns null when no supported ABI has a matching asset (e.g. a 32-bit
// x86 device, or a release that only shipped one arch) — the caller then falls
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
