// How this build was distributed, injected at build time via
// EXPO_PUBLIC_DISTRIBUTION (set per profile in eas.json):
//   - "github": a side-loaded APK — the in-app updater checks GitHub releases
//     and installs the matching-arch APK itself.
//   - "store":  a Play Store / App Store build — updates go through the native
//     in-app-update flow (expo-in-app-updates), never GitHub.
// Defaults to "github" when unset (local dev) so the GitHub path is testable.
export type DistributionChannel = "github" | "store";

export const DISTRIBUTION: DistributionChannel =
  process.env.EXPO_PUBLIC_DISTRIBUTION === "store" ? "store" : "github";

export const isGithubDistribution = DISTRIBUTION === "github";
export const isStoreDistribution = DISTRIBUTION === "store";
