// A downloadable binary attached to a GitHub release.
export type GithubReleaseAsset = {
  name: string;
  size: number;
  browser_download_url: string;
  content_type: string;
};

// Subset of the GitHub "latest release" payload we rely on.
export type GithubRelease = {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
  assets: GithubReleaseAsset[];
};

export type SemVer = {
  major: number;
  minor: number;
  patch: number;
};

// A newer release than the running version: the parsed version, the release
// metadata (for changelog + fallback link) and the arch-matched APK to install.
// `asset` is null when no published APK matches this device's ABI (e.g. an x86
// emulator) — the UI then offers only the browser fallback.
export type GithubUpdate = {
  version: string;
  release: GithubRelease;
  asset: GithubReleaseAsset | null;
};

export type DownloadProgressHandler = (fraction: number) => void;
