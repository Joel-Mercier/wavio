import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import DownloaderCover from "@/components/downloaders/DownloaderCover";
import SoulSyncQueueRow from "@/components/downloaders/soulsync/SoulSyncQueueRow";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useSoulSyncQueue,
  useSoulSyncRecentlyAdded,
} from "@/hooks/soulsync/useSoulSyncDownloads";
import { useSoulSyncQueueArtwork } from "@/hooks/soulsync/useWishlist";
import { soulSyncAlbumArtworkUrl } from "@/services/soulsync/artwork";
import useSoulSync from "@/stores/soulsync";

export default function SoulSyncDownloadsScreen() {
  const { t } = useTranslation();
  const isConnected = useSoulSync((store) => store.isConnected);
  const { data: queue, isLoading, error } = useSoulSyncQueue();
  const artworkByTrack = useSoulSyncQueueArtwork();
  const {
    data: recent,
    isLoading: isLoadingRecent,
    error: recentError,
  } = useSoulSyncRecentlyAdded();

  if (!isConnected) {
    return <Redirect href="/downloaders/soulsync" />;
  }

  const items = queue ?? [];
  // Nothing was fetched, so "nothing is downloading" would be a claim the app
  // can't make.
  const hasFailed = !!error && items.length === 0;
  // Only in-flight work is listed: /downloads drops a task from its in-memory
  // tracker minutes after it settles, so finished ones belong to the library
  // section below rather than to a list that would empty itself.
  const active = items.filter((item) => item.isActive);
  const recentAlbums = recent ?? [];
  const hasRecentFailed = !!recentError && recentAlbums.length === 0;

  return (
    <SettingsScreenScaffold
      title={t("app.settings.downloaders.soulsync.downloadsTitle")}
    >
      <VStack className="gap-y-2">
        <Heading className="text-white mt-2" size="md">
          {t("app.settings.downloaders.soulsync.inProgressTitle")}
        </Heading>
        {isLoading && items.length === 0 ? (
          <Box className="py-6 items-center">
            <ActivityIndicator />
          </Box>
        ) : hasFailed ? (
          <Text className="text-red-400 text-sm py-2">
            {t("app.settings.downloaders.soulsync.loadFailed")}
          </Text>
        ) : active.length === 0 ? (
          <Text className="text-primary-100 text-sm py-2">
            {t("app.settings.downloaders.soulsync.emptyQueue")}
          </Text>
        ) : (
          active.map((item) => (
            <SoulSyncQueueRow
              key={item.id}
              item={item}
              artworkUrl={item.matchKeys
                .map((key) => artworkByTrack.get(key))
                .find(Boolean)}
            />
          ))
        )}

        <Heading className="text-white mt-6" size="md">
          {t("app.settings.downloaders.soulsync.recentTitle")}
        </Heading>
        <Text className="text-primary-100 text-xs">
          {t("app.settings.downloaders.soulsync.recentDescription")}
        </Text>
        {isLoadingRecent && recentAlbums.length === 0 ? (
          <Box className="py-6 items-center">
            <ActivityIndicator />
          </Box>
        ) : hasRecentFailed ? (
          <Text className="text-red-400 text-sm py-2">
            {t("app.settings.downloaders.soulsync.loadFailed")}
          </Text>
        ) : recentAlbums.length === 0 ? (
          <Text className="text-primary-100 text-sm py-2">
            {t("app.settings.downloaders.soulsync.emptyRecent")}
          </Text>
        ) : (
          recentAlbums.map((album) => (
            <HStack key={album.id} className="items-center gap-x-3 py-3">
              <DownloaderCover
                url={soulSyncAlbumArtworkUrl(album, 96)}
                size={48}
              />
              <VStack className="flex-1">
                <Heading
                  className="text-white font-normal"
                  size="sm"
                  numberOfLines={1}
                >
                  {album.title}
                </Heading>
                {!!album.year && (
                  <Text className="text-primary-100 text-sm">{album.year}</Text>
                )}
              </VStack>
            </HStack>
          ))
        )}
      </VStack>
    </SettingsScreenScaffold>
  );
}
