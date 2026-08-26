import { Redirect, useLocalSearchParams } from "expo-router";
import Download from "lucide-react-native/dist/esm/icons/download.mjs";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import TidarrAlbumRow from "@/components/downloaders/tidarr/TidarrAlbumRow";
import EmptyDisplay from "@/components/EmptyDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useEnqueue,
  useIsEnqueuing,
  useQueueQuality,
} from "@/hooks/tidarr/useEnqueue";
import {
  useTidarrArtist,
  useTidarrDiscography,
} from "@/hooks/tidarr/useTidarrBrowse";
import { useDownloadedIds } from "@/hooks/tidarr/useTidarrDownloads";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { artistQueueItem } from "@/services/tidarr/download";
import useTidarr from "@/stores/tidarr";

export default function TidarrArtistScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isConnected = useTidarr((store) => store.isConnected);
  const { showSuccessToast, showErrorToast } = useSettingsToast();

  const { data: artist } = useTidarrArtist(id);
  const { data: sections, isLoading } = useTidarrDiscography(id);
  const { data: downloadedIds } = useDownloadedIds();
  const quality = useQueueQuality();
  const enqueue = useEnqueue();
  const isEnqueuing = useIsEnqueuing("artist", id);

  if (!isConnected) {
    return <Redirect href="/downloaders/tidarr" />;
  }

  const title = artist?.name ?? t("app.settings.downloaders.tidarr.artist");
  const downloaded = new Set(downloadedIds ?? []);

  // Queued as a single `artist` item: Tidarr fans it out into one entry per
  // album itself, honouring the instance's singles filter.
  const handleDownloadAll = () => {
    if (!artist) return;
    enqueue.mutate(artistQueueItem(artist, quality), {
      onSuccess: () =>
        showSuccessToast(t("app.settings.downloaders.tidarr.queuedMessage")),
      onError: () =>
        showErrorToast(t("app.settings.downloaders.tidarr.queueFailed")),
    });
  };

  return (
    <SettingsScreenScaffold title={title}>
      <VStack className="gap-y-2">
        {artist && (
          <Box className="pb-2">
            <FadeOutScaleDown
              onPress={handleDownloadAll}
              disabled={isEnqueuing}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
            >
              {isEnqueuing ? (
                <Spinner color="rgb(41, 41, 41)" />
              ) : (
                <HStack className="items-center gap-x-2">
                  <Download size={18} color="rgb(41, 41, 41)" />
                  <Text className="text-primary-800 font-bold text-lg">
                    {t(
                      "app.settings.downloaders.tidarr.downloadAllAlbumsAction",
                    )}
                  </Text>
                </HStack>
              )}
            </FadeOutScaleDown>
          </Box>
        )}

        {isLoading && !sections ? (
          <Box className="py-16 items-center">
            <ActivityIndicator />
          </Box>
        ) : !sections?.length ? (
          <EmptyDisplay />
        ) : (
          sections.map((section) => (
            <VStack key={section.key}>
              <Heading className="text-white pt-4 pb-1" size="md">
                {t(`app.settings.downloaders.tidarr.sections.${section.key}`)}
              </Heading>
              {section.albums.map((album) => (
                <TidarrAlbumRow
                  key={album.id}
                  album={album}
                  isDownloaded={downloaded.has(String(album.id))}
                />
              ))}
            </VStack>
          ))
        )}
      </VStack>
    </SettingsScreenScaffold>
  );
}
