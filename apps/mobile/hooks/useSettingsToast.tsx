import { useTranslation } from "react-i18next";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";

export function useSettingsToast() {
  const { t } = useTranslation();
  const toast = useToast();

  const showSuccessToast = (description: string) => {
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>{description}</ToastDescription>
        </Toast>
      ),
    });
  };

  const showErrorToast = (description: string) => {
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="error">
          <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
          <ToastDescription>{description}</ToastDescription>
        </Toast>
      ),
    });
  };

  return { showSuccessToast, showErrorToast };
}
