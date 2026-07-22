import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  isGithubDistribution,
  isStoreDistribution,
} from "@/config/distribution";
import { useIsDeviceOnline } from "@/hooks/useIsOnline";
import {
  checkForGithubUpdate,
  downloadAndInstall,
  type GithubUpdate,
  isStoreUpdateAvailable,
  startStoreUpdate,
} from "@/services/appUpdate";
import useApp from "@/stores/app";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "upToDate"
  | "checkFailed"
  | "error";

// Re-check GitHub at most this often on auto-check (manual checks bypass it), so
// launches stay well under GitHub's 60 req/h unauthenticated limit.
const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// The GitHub updater only makes sense on a side-loaded Android APK.
const githubUpdaterSupported =
  isGithubDistribution && Platform.OS === "android";

// Orchestrates the in-app updater. Pass `{ autoCheck: true }` from the single
// launch-time gate; the settings screen uses it without auto-check for the
// manual "Check for updates" button. Both branches (github APK / store) are
// handled here so callers stay distribution-agnostic.
export function useAppUpdate({ autoCheck = false } = {}) {
  const autoUpdateCheckEnabled = useApp((s) => s.autoUpdateCheckEnabled);
  const lastDismissedUpdateVersion = useApp(
    (s) => s.lastDismissedUpdateVersion,
  );
  const setLastDismissedUpdateVersion = useApp(
    (s) => s.setLastDismissedUpdateVersion,
  );
  const lastUpdateCheckAt = useApp((s) => s.lastUpdateCheckAt);
  const setLastUpdateCheckAt = useApp((s) => s.setLastUpdateCheckAt);
  const isDeviceOnline = useIsDeviceOnline();

  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<GithubUpdate | null>(null);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const ranAutoCheck = useRef(false);

  // `manual` bypasses the throttle and the dismissal filter (an explicit tap
  // always re-surfaces an available update); the auto path honours both.
  const runGithubCheck = useCallback(
    async (manual: boolean) => {
      setStatus("checking");
      try {
        const result = await checkForGithubUpdate();
        // Only stamp the throttle on a completed check. A failure (below) leaves
        // it untouched so the next launch retries instead of being suppressed for
        // hours by a transient blip.
        setLastUpdateCheckAt(Date.now());
        if (!result) {
          setStatus(manual ? "upToDate" : "idle");
          return;
        }
        if (!manual && result.version === lastDismissedUpdateVersion) {
          setStatus("idle");
          return;
        }
        setUpdate(result);
        setStatus("available");
      } catch {
        setStatus(manual ? "checkFailed" : "idle");
      }
    },
    [lastDismissedUpdateVersion, setLastUpdateCheckAt],
  );

  const runStoreCheck = useCallback(async (manual: boolean) => {
    setStatus("checking");
    const available = await isStoreUpdateAvailable();
    if (available) {
      await startStoreUpdate();
      setStatus("idle");
    } else {
      setStatus(manual ? "upToDate" : "idle");
    }
  }, []);

  // Manual "Check for updates" — used by the settings screen.
  const check = useCallback(async () => {
    if (isStoreDistribution) {
      await runStoreCheck(true);
      return;
    }
    if (githubUpdaterSupported) {
      await runGithubCheck(true);
    }
  }, [runGithubCheck, runStoreCheck]);

  const startDownload = useCallback(async () => {
    if (!update?.asset) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress(0);
    setStatus("downloading");
    try {
      await downloadAndInstall(
        update,
        (fraction) => setProgress(fraction),
        controller.signal,
      );
      setStatus("installing");
    } catch {
      setStatus("error");
    } finally {
      abortRef.current = null;
    }
  }, [update]);

  const dismiss = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (update) setLastDismissedUpdateVersion(update.version);
    setUpdate(null);
    setStatus("idle");
  }, [update, setLastDismissedUpdateVersion]);

  // Reset transient UI state (e.g. clearing an "up to date" toast) without
  // recording a dismissal.
  const reset = useCallback(() => {
    setUpdate(null);
    setStatus("idle");
    setProgress(0);
  }, []);

  useEffect(() => {
    if (!autoCheck || ranAutoCheck.current) return;
    if (!autoUpdateCheckEnabled || !isDeviceOnline) return;

    if (isStoreDistribution) {
      ranAutoCheck.current = true;
      void runStoreCheck(false);
      return;
    }
    if (!githubUpdaterSupported) return;

    const throttled =
      lastUpdateCheckAt != null &&
      Date.now() - lastUpdateCheckAt < AUTO_CHECK_INTERVAL_MS;
    if (throttled) return;

    ranAutoCheck.current = true;
    void runGithubCheck(false);
  }, [
    autoCheck,
    autoUpdateCheckEnabled,
    isDeviceOnline,
    lastUpdateCheckAt,
    runGithubCheck,
    runStoreCheck,
  ]);

  return {
    status,
    update,
    progress,
    check,
    startDownload,
    dismiss,
    reset,
    isStore: isStoreDistribution,
    supported: githubUpdaterSupported || isStoreDistribution,
  };
}
