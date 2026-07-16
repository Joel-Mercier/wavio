import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ConfirmActionDialog from "@/components/settings/ConfirmActionDialog";
import {
  SettingsActionRow,
  SettingsSectionTitle,
} from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import StorageOverview from "@/components/settings/StorageOverview";
import { Divider } from "@/components/ui/divider";
import { VStack } from "@/components/ui/vstack";
import { queryPersister } from "@/config/queryClient";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import useActivity from "@/stores/activity";
import useRecentPlays from "@/stores/recentPlays";
import useRecentSearches from "@/stores/recentSearches";

export default function StorageDataSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showSuccessToast } = useSettingsToast();
  const [showClearCacheAlertDialog, setShowClearCacheAlertDialog] =
    useState(false);
  const [showRecentPlaysAlertDialog, setShowRecentPlaysAlertDialog] =
    useState(false);
  const [showRecentSearchesAlertDialog, setShowRecentSearchesAlertDialog] =
    useState(false);
  const [showActivityAlertDialog, setShowActivityAlertDialog] = useState(false);
  const [storageRefreshToken, setStorageRefreshToken] = useState(0);
  const clearRecentPlays = useRecentPlays((store) => store.clearRecentPlays);
  const clearRecentSearches = useRecentSearches(
    (store) => store.clearRecentSearches,
  );
  const clearActivity = useActivity((store) => store.clearActivity);

  const handleClearCachePress = () => {
    // Clears only the active server's query cache (in-memory + persisted blob).
    // Downloaded files are untouched.
    queryClient.clear();
    void queryPersister.removeClient();
    setShowClearCacheAlertDialog(false);
    setStorageRefreshToken((value) => value + 1);
    showSuccessToast(t("app.settings.cacheSettings.successMessage"));
  };

  const handleDeleteRecentPlaysPress = () => {
    clearRecentPlays();
    setShowRecentPlaysAlertDialog(false);
    showSuccessToast(
      t("app.settings.contentSettings.recentPlaysSuccessMessage"),
    );
  };

  const handleDeleteRecentSearchesPress = () => {
    clearRecentSearches();
    setShowRecentSearchesAlertDialog(false);
    showSuccessToast(
      t("app.settings.contentSettings.recentSearchesSuccessMessage"),
    );
  };

  const handleDeleteActivityPress = () => {
    clearActivity();
    setShowActivityAlertDialog(false);
    showSuccessToast(t("app.settings.contentSettings.activitySuccessMessage"));
  };

  return (
    <SettingsScreenScaffold
      title={t("app.settings.menu.storage.title")}
      overlays={
        <>
          <ConfirmActionDialog
            isOpen={showClearCacheAlertDialog}
            onClose={() => setShowClearCacheAlertDialog(false)}
            title={t("app.settings.cacheSettings.confirmTitle")}
            description={t("app.settings.cacheSettings.confirmDescription")}
            cancelLabel={t("app.shared.cancel")}
            confirmLabel={t("app.shared.clear")}
            onConfirm={handleClearCachePress}
          />
          <ConfirmActionDialog
            isOpen={showRecentPlaysAlertDialog}
            onClose={() => setShowRecentPlaysAlertDialog(false)}
            title={t("app.settings.contentSettings.recentPlaysConfirmTitle")}
            description={t(
              "app.settings.contentSettings.recentPlaysConfirmDescription",
            )}
            cancelLabel={t("app.shared.cancel")}
            confirmLabel={t("app.shared.delete")}
            onConfirm={handleDeleteRecentPlaysPress}
          />
          <ConfirmActionDialog
            isOpen={showRecentSearchesAlertDialog}
            onClose={() => setShowRecentSearchesAlertDialog(false)}
            title={t("app.settings.contentSettings.recentSearchesConfirmTitle")}
            description={t(
              "app.settings.contentSettings.recentSearchesConfirmDescription",
            )}
            cancelLabel={t("app.shared.cancel")}
            confirmLabel={t("app.shared.delete")}
            onConfirm={handleDeleteRecentSearchesPress}
          />
          <ConfirmActionDialog
            isOpen={showActivityAlertDialog}
            onClose={() => setShowActivityAlertDialog(false)}
            title={t("app.settings.contentSettings.activityConfirmTitle")}
            description={t(
              "app.settings.contentSettings.activityConfirmDescription",
            )}
            cancelLabel={t("app.shared.cancel")}
            confirmLabel={t("app.shared.delete")}
            onConfirm={handleDeleteActivityPress}
          />
        </>
      }
    >
      <VStack className="gap-y-4">
        <SettingsSectionTitle title={t("app.settings.storageSettings.title")} />
        <StorageOverview refreshToken={storageRefreshToken} />
        <SettingsActionRow
          variant="danger"
          label={t("app.settings.cacheSettings.label")}
          description={t("app.settings.cacheSettings.description")}
          actionLabel={t("app.settings.cacheSettings.clearAction")}
          onPress={() => setShowClearCacheAlertDialog(true)}
        />
        <Divider className="bg-primary-400" />
        <SettingsSectionTitle title={t("app.settings.contentSettings.title")} />
        <SettingsActionRow
          variant="danger"
          label={t("app.settings.contentSettings.recentSearchesLabel")}
          description={t(
            "app.settings.contentSettings.recentSearchesDescription",
          )}
          actionLabel={t("app.shared.delete")}
          onPress={() => setShowRecentSearchesAlertDialog(true)}
        />
        <SettingsActionRow
          variant="danger"
          label={t("app.settings.contentSettings.recentPlaysLabel")}
          description={t("app.settings.contentSettings.recentPlaysDescription")}
          actionLabel={t("app.shared.delete")}
          onPress={() => setShowRecentPlaysAlertDialog(true)}
        />
        <SettingsActionRow
          variant="danger"
          label={t("app.settings.contentSettings.activityLabel")}
          description={t("app.settings.contentSettings.activityDescription")}
          actionLabel={t("app.shared.delete")}
          onPress={() => setShowActivityAlertDialog(true)}
        />
      </VStack>
    </SettingsScreenScaffold>
  );
}
