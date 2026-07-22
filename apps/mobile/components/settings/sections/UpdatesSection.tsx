import * as Application from "expo-application";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  SettingsActionRow,
  SettingsSectionTitle,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import UpdateAvailableDialog from "@/components/update/UpdateAvailableDialog";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import useApp from "@/stores/app";

export default function UpdatesSection() {
  const { t } = useTranslation();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const autoUpdateCheckEnabled = useApp((s) => s.autoUpdateCheckEnabled);
  const setAutoUpdateCheckEnabled = useApp((s) => s.setAutoUpdateCheckEnabled);
  const { status, update, progress, check, startDownload, dismiss, reset } =
    useAppUpdate();

  // A manual check that turns up nothing resolves to "upToDate"; a check that
  // couldn't reach GitHub resolves to "checkFailed". Acknowledge either with a
  // toast, then reset so the row is ready for another check.
  useEffect(() => {
    if (status === "upToDate") {
      showSuccessToast(t("app.settings.updatesSettings.upToDate"));
      reset();
    } else if (status === "checkFailed") {
      showErrorToast(t("app.settings.updatesSettings.checkFailed"));
      reset();
    }
  }, [status, reset, showSuccessToast, showErrorToast, t]);

  return (
    <SettingsScreenScaffold
      title={t("app.settings.menu.updates.title")}
      overlays={
        <UpdateAvailableDialog
          status={status}
          update={update}
          progress={progress}
          onUpdate={startDownload}
          onDismiss={dismiss}
        />
      }
    >
      <VStack className="gap-y-4">
        <SettingsToggleRow
          label={t("app.settings.updatesSettings.autoCheckLabel")}
          description={t("app.settings.updatesSettings.autoCheckDescription")}
          value={autoUpdateCheckEnabled}
          onToggle={(value) => setAutoUpdateCheckEnabled(value)}
        />
        <SettingsActionRow
          label={t("app.settings.updatesSettings.checkNowLabel")}
          description={t("app.settings.updatesSettings.checkNowDescription")}
          actionLabel={
            status === "checking"
              ? t("app.settings.updatesSettings.checking")
              : t("app.settings.updatesSettings.checkNowAction")
          }
          onPress={() => check()}
          disabled={status === "checking"}
        />
        <SettingsSectionTitle
          title={t("app.settings.updatesSettings.currentVersionLabel")}
        />
        <Text className="text-primary-100 text-sm">
          {Application.nativeApplicationVersion ?? "—"}
        </Text>
      </VStack>
    </SettingsScreenScaffold>
  );
}
