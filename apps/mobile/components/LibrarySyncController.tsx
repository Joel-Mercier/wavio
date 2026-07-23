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

  useEffect(() => {
    if (!enabled || !isOnline) return;
    librarySyncService.startIfNeeded();
  }, [enabled, isOnline]);

  useEffect(() => {
    if (!enabled) return;
    const onChange = (status: AppStateStatus) => {
      if (status === "active") librarySyncService.startIfNeeded();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [enabled]);

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
