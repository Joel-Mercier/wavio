import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { subscribeDrainResult } from "@/services/offlineMutations/replay";
import { TOAST_DURATION } from "@/utils/toastDuration";

// Mounted once at the app root. Surfaces replay failures of offline-queued
// mutations as a toast, since the replay service can't render UI itself.
export default function OfflineMutationsSync() {
  const { t } = useTranslation();
  const toast = useToast();

  useEffect(
    () =>
      subscribeDrainResult(({ dropped }) => {
        toast.show({
          placement: "top",
          duration: TOAST_DURATION.long,
          render: () => (
            <Toast action="error">
              <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
              <ToastDescription>
                {t("app.pendingChanges.syncFailedMessage", { count: dropped })}
              </ToastDescription>
            </Toast>
          ),
        });
      }),
    [toast, t],
  );

  return null;
}
