import type { ScanStatus } from "@/stores/localLibrary";

// The indexer's phase, in words. Shared by the first-login gate and the music
// library settings screen so a background sync and a blocking one describe
// themselves the same way.
const STEP_KEY: Record<ScanStatus["phase"], string> = {
  idle: "app.localIndexing.listing",
  listing: "app.localIndexing.listing",
  indexing: "app.localIndexing.indexing",
  artwork: "app.localIndexing.artwork",
  pruning: "app.localIndexing.pruning",
  done: "app.localIndexing.finishing",
};

export const scanStepKey = (phase: ScanStatus["phase"]): string =>
  STEP_KEY[phase];

// Why the scan failed, in words. Anything not listed here falls back to
// `errors.generic`, which is also what carries `errorDetail` — so an
// unclassified failure still says something useful instead of leaking a raw
// AxiosError message, which is what the gate used to render.
const ERROR_KEY: Record<string, string> = {
  ERR_SCAN_METERED_NETWORK: "app.localIndexing.errors.meteredNetwork",
  ERR_SCAN_NO_FOLDERS: "app.localIndexing.errors.noFolders",
  ERR_FS_AUTH: "app.localIndexing.errors.auth",
  ERR_FS_NOT_FOUND: "app.localIndexing.errors.notFound",
  ERR_FS_UNREACHABLE: "app.localIndexing.errors.unreachable",
  ERR_FS_NOT_SUPPORTED: "app.localIndexing.errors.notSupported",
  ERR_FS_SERVER: "app.localIndexing.errors.server",
};

export const scanErrorKey = (code: string | undefined): string =>
  (code && ERROR_KEY[code]) || "app.localIndexing.errors.generic";
