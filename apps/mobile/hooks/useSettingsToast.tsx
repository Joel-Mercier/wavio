import { useTranslation } from "react-i18next";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { TOAST_DURATION } from "@/utils/toastDuration";

export function useSettingsToast() {
  const { t } = useTranslation();
  const toast = useToast();

  const showSuccessToast = (description: string) => {
    toast.show({
      placement: "top",
      duration: TOAST_DURATION.default,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>{description}</ToastDescription>
        </Toast>
      ),
    });
  };

  const showInfoToast = (description: string) => {
    toast.show({
      placement: "top",
      duration: TOAST_DURATION.default,
      render: () => (
        <Toast action="info">
          <ToastTitle>{t("app.shared.toastInfoTitle")}</ToastTitle>
          <ToastDescription>{description}</ToastDescription>
        </Toast>
      ),
    });
  };

  const showErrorToast = (description: string) => {
    toast.show({
      placement: "top",
      duration: TOAST_DURATION.default,
      render: () => (
        <Toast action="error">
          <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
          <ToastDescription>{description}</ToastDescription>
        </Toast>
      ),
    });
  };

  return { showSuccessToast, showInfoToast, showErrorToast };
}
