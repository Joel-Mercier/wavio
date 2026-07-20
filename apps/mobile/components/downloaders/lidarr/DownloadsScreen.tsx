import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import DownloadHistoryRow from "@/components/downloaders/lidarr/DownloadHistoryRow";
import DownloadQueueRow from "@/components/downloaders/lidarr/DownloadQueueRow";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useLidarrHistory,
  useLidarrQueue,
} from "@/hooks/lidarr/useLidarrDownloads";
import useLidarr from "@/stores/lidarr";

export default function DownloadsScreen() {
  const { t } = useTranslation();
  const isConnected = useLidarr((store) => store.isConnected);
  const { data: queue, isLoading: queueLoading } = useLidarrQueue();
  const { data: history, isLoading: historyLoading } = useLidarrHistory();

  if (!isConnected) {
    return <Redirect href="/downloaders/lidarr" />;
  }

  const queueItems = queue ?? [];
  const historyItems = history ?? [];

  return (
    <SettingsScreenScaffold
      title={t("app.settings.downloaders.downloads.title")}
    >
      <VStack className="gap-y-2">
        <Heading className="text-white mt-2" size="md">
          {t("app.settings.downloaders.downloads.inProgressTitle")}
        </Heading>
        {queueLoading && queueItems.length === 0 ? (
          <Box className="py-6 items-center">
            <ActivityIndicator />
          </Box>
        ) : queueItems.length === 0 ? (
          <Text className="text-primary-100 text-sm py-2">
            {t("app.settings.downloaders.downloads.emptyQueue")}
          </Text>
        ) : (
          queueItems.map((item) => (
            <DownloadQueueRow key={item.id} item={item} />
          ))
        )}

        <Heading className="text-white mt-6" size="md">
          {t("app.settings.downloaders.downloads.historyTitle")}
        </Heading>
        {historyLoading && historyItems.length === 0 ? (
          <Box className="py-6 items-center">
            <ActivityIndicator />
          </Box>
        ) : historyItems.length === 0 ? (
          <Text className="text-primary-100 text-sm py-2">
            {t("app.settings.downloaders.downloads.emptyHistory")}
          </Text>
        ) : (
          historyItems.map((item) => (
            <DownloadHistoryRow key={item.id} item={item} />
          ))
        )}
      </VStack>
    </SettingsScreenScaffold>
  );
}
