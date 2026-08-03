import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AppState, type AppStateStatus } from "react-native";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { useIsOnline } from "@/hooks/useIsOnline";
import {
  runIdMigrationCheck,
  subscribeIdMigrationCompleted,
} from "@/services/navidromeIdMigration";
import { librarySyncService } from "@/services/offline";
import { subscribeLibrarySyncCompleted } from "@/services/offline/librarySyncService";
import useLibrarySync from "@/stores/librarySync";

// Mounted once at the app root (like OfflineStarredAutoSync). Nudges the
// extended-offline library sync whenever it might have work to do: toggle-on,
// app start, coming back online, returning to the foreground (which also
// triggers the periodic delta resync of a completed pass). The service itself
// resumes from its persisted cursor and no-ops when there's nothing to do.
// Also surfaces the "library fully cached" completion as a toast, since the
// service can't render UI itself.
export default function LibrarySyncController() {
  const { t } = useTranslation();
  const toast = useToast();
  const isOnline = useIsOnline();
  const enabled = useLibrarySync((s) => s.extendedOfflineModeEnabled);
  const idMigration = useLibrarySync((s) => s.idMigration);

  useEffect(() => {
    if (!enabled || !isOnline) return;
    librarySyncService.startIfNeeded();
  }, [enabled, isOnline]);

  // Not gated on `enabled`: the canonical-id migration has to be resolved for
  // every Navidrome user, not just those using extended offline mode. The
  // interceptor only flags that a probe is due — running it here means it
  // retries on reconnect and on the foreground kick below.
  useEffect(() => {
    if (idMigration !== "checking" || !isOnline) return;
    void runIdMigrationCheck();
  }, [idMigration, isOnline]);

  useEffect(() => {
    const onChange = (status: AppStateStatus) => {
      if (status !== "active") return;
      if (enabled) librarySyncService.startIfNeeded();
      void runIdMigrationCheck();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [enabled]);

  useEffect(
    () =>
      subscribeIdMigrationCompleted(({ remappedCount }) => {
        toast.show({
          placement: "top",
          duration: 6000,
          render: () => (
            <Toast action="success">
              <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
              <ToastDescription>
                {t("app.settings.offlineSettings.idMigrationCompletedToast", {
                  count: remappedCount,
                })}
              </ToastDescription>
            </Toast>
          ),
        });
      }),
    [toast, t],
  );

  useEffect(
    () =>
      subscribeLibrarySyncCompleted(({ downloadedCount }) => {
        toast.show({
          placement: "top",
          duration: 4000,
          render: () => (
            <Toast action="success">
              <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
              <ToastDescription>
                {t(
                  "app.settings.offlineSettings.extendedOfflineCompletedToast",
                  {
                    count: downloadedCount,
                  },
                )}
              </ToastDescription>
            </Toast>
          ),
        });
      }),
    [toast, t],
  );

  return null;
}
