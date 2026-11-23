import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import {
  enableReleaseNotificationsFromSystemSettings,
  requestNotificationPermission,
  takeReleaseNotificationsPrompt,
} from "@/services/releasePush";
import useApp from "@/stores/app";

// Asked once, before Android's own permission dialog, so the request comes with
// a reason. Declining turns release notifications off; Settings → Updates turns
// them back on. When Android won't show its dialog any more, the system
// settings open instead, and allowing notifications there turns them on.
export default function ReleaseNotificationsPrompt({
  hidden,
}: {
  hidden: boolean;
}) {
  const { t } = useTranslation();
  const { showErrorToast } = useSettingsToast();
  const setEnabled = useApp((s) => s.setReleaseNotificationsEnabled);
  const setHandled = useApp((s) => s.setReleaseNotificationsPromptHandled);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (takeReleaseNotificationsPrompt()) setIsOpen(true);
  }, []);

  const settle = (enabled: boolean) => {
    setIsOpen(false);
    setHandled(true);
    setEnabled(enabled);
  };

  const enable = async () => {
    setIsOpen(false);
    const result = await requestNotificationPermission();
    settle(result === "granted");
    if (result === "blocked") {
      showErrorToast(t("app.settings.updatesSettings.notifyPermissionDenied"));
      enableReleaseNotificationsFromSystemSettings();
    }
  };

  return (
    <AlertDialog
      isOpen={isOpen && !hidden}
      onClose={() => settle(false)}
      size="md"
    >
      <AlertDialogBackdrop />
      <AlertDialogContent className="bg-primary-800 border-primary-400">
        <AlertDialogHeader>
          <Heading className="text-white font-bold" size="md">
            {t("app.update.notificationsPrompt.title")}
          </Heading>
        </AlertDialogHeader>
        <AlertDialogBody className="mt-3 mb-4">
          <Text className="text-primary-50" size="sm">
            {t("app.update.notificationsPrompt.description")}
          </Text>
        </AlertDialogBody>
        <AlertDialogFooter className="items-center justify-center">
          <FadeOutScaleDown
            onPress={() => settle(false)}
            className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
          >
            <Text className="text-white font-bold text-lg">
              {t("app.update.notificationsPrompt.decline")}
            </Text>
          </FadeOutScaleDown>
          <FadeOutScaleDown
            onPress={enable}
            className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
          >
            <Text className="text-primary-800 font-bold text-lg">
              {t("app.update.notificationsPrompt.enable")}
            </Text>
          </FadeOutScaleDown>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
