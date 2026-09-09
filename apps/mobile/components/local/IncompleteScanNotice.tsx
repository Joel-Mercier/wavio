import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import useLocalLibrary from "@/stores/localLibrary";

// Tells the user when a scan finished without seeing the whole library, and
// when it hid folders on the strength of an ignore file.
//
// Without the first, a scan interrupted by a dropped link or an unreadable
// folder is indistinguishable from a successful one: the prune guard correctly
// leaves the index alone, so nothing disappears — but nothing new appears
// either, and the library silently reflects a partial walk. Without the second,
// a folder really does disappear (along with its tag corrections) and the only
// record is a Sentry breadcrumb the user can't see.
//
// It lives outside LocalLibraryIndexing because that gate unmounts the moment
// the scan stamps `lastScanAt`, so it never gets the chance to report anything.
export default function IncompleteScanNotice() {
  const { t } = useTranslation();
  const { showErrorToast, showInfoToast } = useSettingsToast();
  const pending = useLocalLibrary((s) => s.incompleteScanNotice);
  const unreadable = useLocalLibrary((s) => s.lastScanResult?.unreadable ?? 0);
  const hiddenPending = useLocalLibrary((s) => s.hiddenFoldersNotice);
  const hidden = useLocalLibrary(
    (s) => s.lastScanResult?.ignoredDirectories ?? 0,
  );

  useEffect(() => {
    if (!pending) return;
    showErrorToast(
      t("app.localIndexing.partialScanWarning", { count: unreadable }),
    );
    // Clearing the flag is what makes this fire once: `showErrorToast` is
    // rebuilt every render, so the effect re-runs freely — the early return
    // above is the guard, not the dependency list.
    useLocalLibrary.getState().clearIncompleteScanNotice();
  }, [pending, unreadable, t, showErrorToast]);

  useEffect(() => {
    if (!hiddenPending) return;
    showInfoToast(
      t("app.localIndexing.hiddenFoldersNotice", { count: hidden }),
    );
    useLocalLibrary.getState().clearHiddenFoldersNotice();
  }, [hiddenPending, hidden, t, showInfoToast]);

  return null;
}
