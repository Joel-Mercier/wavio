import * as Application from "expo-application";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform } from "react-native";
import {
  SettingsActionRow,
  SettingsSectionTitle,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import UpdateAvailableDialog from "@/components/update/UpdateAvailableDialog";
import { isStoreDistribution } from "@/config/distribution";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import {
  enableReleaseNotificationsFromSystemSettings,
  releaseNotificationsSupported,
  requestNotificationPermission,
} from "@/services/releasePush";
import useApp from "@/stores/app";

const canRateOnPlayStore = isStoreDistribution && Platform.OS === "android";

// A direct link to the listing, never the in-app review card: Play may silently
// skip the card once its quota is spent, which would make the row look broken.
const openPlayStoreListing = () => {
  const id = Application.applicationId;
  Linking.openURL(`market://details?id=${id}`)
    .catch(() =>
      Linking.openURL(`https://play.google.com/store/apps/details?id=${id}`),
    )
    .catch(() => {});
};

export default function UpdatesSection() {
  const { t } = useTranslation();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const autoUpdateCheckEnabled = useApp((s) => s.autoUpdateCheckEnabled);
  const setAutoUpdateCheckEnabled = useApp((s) => s.setAutoUpdateCheckEnabled);
  const releaseNotificationsEnabled = useApp(
    (s) => s.releaseNotificationsEnabled,
  );
  const setReleaseNotificationsEnabled = useApp(
    (s) => s.setReleaseNotificationsEnabled,
  );
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

  const toggleReleaseNotifications = async (enabled: boolean) => {
    if (!enabled) {
      setReleaseNotificationsEnabled(false);
      return;
    }
    const permission = await requestNotificationPermission();
    if (permission === "granted") {
      setReleaseNotificationsEnabled(true);
      return;
    }
    showErrorToast(t("app.settings.updatesSettings.notifyPermissionDenied"));
    if (permission === "blocked")
      enableReleaseNotificationsFromSystemSettings();
  };

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
        {releaseNotificationsSupported && (
          <SettingsToggleRow
            label={t("app.settings.updatesSettings.notifyLabel")}
            description={t("app.settings.updatesSettings.notifyDescription")}
            value={releaseNotificationsEnabled}
            onToggle={(value) => void toggleReleaseNotifications(value)}
          />
        )}
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
        {canRateOnPlayStore && (
          <SettingsActionRow
            label={t("app.settings.updatesSettings.rateLabel")}
            description={t("app.settings.updatesSettings.rateDescription")}
            actionLabel={t("app.settings.updatesSettings.rateAction")}
            onPress={openPlayStoreListing}
          />
        )}
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
