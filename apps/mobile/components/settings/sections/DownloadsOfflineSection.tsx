import { type Href, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  SettingsActionRow,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useStarred2 } from "@/hooks/backend/useLists";
import {
  useDownloadedTracksCount,
  useDownloadedTracksList,
  useOfflineDownloads,
  useTotalDownloadSize,
} from "@/hooks/offline";
import useApp from "@/stores/app";
import useOfflineMutations from "@/stores/offlineMutations";
import { niceBytes } from "@/utils/fileSize";

export default function DownloadsOfflineSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const downloadsWifiOnly = useApp((store) => store.downloadsWifiOnly);
  const setDownloadsWifiOnly = useApp((store) => store.setDownloadsWifiOnly);
  const autoSignOutOnServerUnreachable = useApp(
    (store) => store.autoSignOutOnServerUnreachable,
  );
  const setAutoSignOutOnServerUnreachable = useApp(
    (store) => store.setAutoSignOutOnServerUnreachable,
  );
  const { offlineModeEnabled, setOfflineModeEnabled } = useOfflineDownloads();
  // Use the plain selector form (not `.use.queue()`): the React Compiler only
  // recognizes a call as a hook by its `use*` call-site name, so the member
  // form gets memoized as a normal call and skips the underlying store hook on
  // some renders — shifting every hook after it and breaking the hook order.
  const pendingChangesCount = useOfflineMutations((s) => s.queue).length;
  const downloadedTracksCount = useDownloadedTracksCount();
  const totalDownloadSize = useTotalDownloadSize();
  const downloadedTracksList = useDownloadedTracksList();
  const { data: starredTracksData } = useStarred2({});
  const totalTracksToDownload = starredTracksData?.starred2?.song?.length ?? 0;

  return (
    <SettingsScreenScaffold title={t("app.settings.menu.downloads.title")}>
      <VStack className="gap-y-4">
        <SettingsToggleRow
          label={t("app.settings.offlineSettings.offlineModeLabel")}
          description={t("app.settings.offlineSettings.offlineModeDescription")}
          value={offlineModeEnabled}
          onToggle={(value) => setOfflineModeEnabled(value)}
        >
          {offlineModeEnabled && (
            <Text className="text-emerald-400 text-sm">
              {t("app.settings.offlineSettings.downloadedTracksCount", {
                count: downloadedTracksCount,
                total: Math.max(
                  totalTracksToDownload,
                  downloadedTracksList.length,
                ),
                size: niceBytes(totalDownloadSize),
              })}
            </Text>
          )}
        </SettingsToggleRow>
        <SettingsToggleRow
          label={t("app.settings.offlineSettings.downloadsWifiOnlyLabel")}
          description={t(
            "app.settings.offlineSettings.downloadsWifiOnlyDescription",
          )}
          value={downloadsWifiOnly}
          onToggle={(value) => setDownloadsWifiOnly(value)}
        />
        <SettingsToggleRow
          label={t("app.settings.offlineSettings.autoSignOutLabel")}
          description={t("app.settings.offlineSettings.autoSignOutDescription")}
          value={autoSignOutOnServerUnreachable}
          onToggle={(value) => setAutoSignOutOnServerUnreachable(value)}
        />
        {offlineModeEnabled && downloadedTracksList.length > 0 && (
          <SettingsActionRow
            label={t("app.settings.offlineSettings.manageDownloadsLabel")}
            description={t(
              "app.settings.offlineSettings.manageDownloadsDescription",
            )}
            actionLabel={t(
              "app.settings.offlineSettings.manageDownloadsAction",
            )}
            onPress={() => router.navigate("/offline-downloads")}
          />
        )}
        {pendingChangesCount > 0 && (
          <SettingsActionRow
            label={t("app.settings.offlineSettings.pendingChangesLabel")}
            description={t(
              "app.settings.offlineSettings.pendingChangesDescription",
              { count: pendingChangesCount },
            )}
            actionLabel={t("app.settings.offlineSettings.pendingChangesAction")}
            onPress={() => router.navigate("/pending-changes" as Href)}
          />
        )}
      </VStack>
    </SettingsScreenScaffold>
  );
}
