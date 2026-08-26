import { Redirect, useLocalSearchParams } from "expo-router";
import CircleCheck from "lucide-react-native/dist/esm/icons/circle-check.mjs";
import Download from "lucide-react-native/dist/esm/icons/download.mjs";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import { Uniwind } from "uniwind";
import DownloaderCover from "@/components/downloaders/DownloaderCover";
import TidarrTrackRow from "@/components/downloaders/tidarr/TidarrTrackRow";
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
import { useTidarrAlbum } from "@/hooks/tidarr/useTidarrBrowse";
import { useDownloadedIds } from "@/hooks/tidarr/useTidarrDownloads";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { albumQueueItem } from "@/services/tidarr/download";
import { tidalCoverUrl } from "@/services/tidarr/images";
import useTidarr from "@/stores/tidarr";

export default function TidarrAlbumScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isConnected = useTidarr((store) => store.isConnected);
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [emerald500] = Uniwind.getCSSVariable([
    "--color-emerald-500",
  ]) as string[];

  const { data, isLoading } = useTidarrAlbum(id);
  const { data: downloadedIds } = useDownloadedIds();
  const quality = useQueueQuality();
  const enqueue = useEnqueue();
  const isEnqueuing = useIsEnqueuing("album", id);

  if (!isConnected) {
    return <Redirect href="/downloaders/tidarr" />;
  }

  const album = data?.album;
  const title = album?.title ?? t("app.settings.downloaders.tidarr.album");

  if (!album) {
    return (
      <SettingsScreenScaffold title={title}>
        {isLoading ? (
          <Box className="py-16 items-center">
            <ActivityIndicator />
          </Box>
        ) : (
          <EmptyDisplay />
        )}
      </SettingsScreenScaffold>
    );
  }

  const downloaded = new Set(downloadedIds ?? []);
  // A marker, not a gate: Tidarr's history is a bare list of ids whose album and
  // track spaces overlap, so this can be a false positive — the download has to
  // stay reachable either way.
  const isDownloaded = downloaded.has(String(album.id));
  const trackCount = album.numberOfTracks ?? data?.tracks.length;
  const metaParts = [
    album.artists?.[0]?.name,
    album.releaseDate?.slice(0, 4),
    trackCount
      ? t("app.settings.downloaders.tidarr.trackCount", { count: trackCount })
      : undefined,
    album.audioQuality,
  ].filter(Boolean);

  const handleDownload = () => {
    enqueue.mutate(albumQueueItem(album, quality), {
      onSuccess: () =>
        showSuccessToast(t("app.settings.downloaders.tidarr.queuedMessage")),
      onError: () =>
        showErrorToast(t("app.settings.downloaders.tidarr.queueFailed")),
    });
  };

  return (
    <SettingsScreenScaffold title={title}>
      <VStack className="gap-y-4">
        <HStack className="items-center gap-x-4 py-2">
          <DownloaderCover url={tidalCoverUrl(album.cover, 640)} size={96} />
          <VStack className="flex-1 gap-y-1">
            <Heading className="text-white" size="md" numberOfLines={2}>
              {album.title}
            </Heading>
            <Text className="text-primary-100 text-sm">
              {metaParts.join(" · ")}
            </Text>
          </VStack>
        </HStack>

        <VStack className="gap-y-2">
          {isDownloaded && (
            <HStack className="items-center justify-center gap-x-2">
              <CircleCheck size={20} color={emerald500} />
              <Text className="text-emerald-400 text-md">
                {t("app.settings.downloaders.tidarr.alreadyDownloaded")}
              </Text>
            </HStack>
          )}
          <FadeOutScaleDown
            onPress={handleDownload}
            disabled={isEnqueuing}
            className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full self-center"
          >
            {isEnqueuing ? (
              <Spinner color="rgb(41, 41, 41)" />
            ) : (
              <HStack className="items-center gap-x-2">
                <Download size={18} color="rgb(41, 41, 41)" />
                <Text className="text-primary-800 font-bold text-lg">
                  {t("app.settings.downloaders.tidarr.downloadAction")}
                </Text>
              </HStack>
            )}
          </FadeOutScaleDown>
        </VStack>

        <Box className="h-px bg-primary-500 my-2" />

        {data?.tracks.map((track) => (
          <TidarrTrackRow
            key={track.id}
            track={track}
            showCover={false}
            isDownloaded={downloaded.has(String(track.id))}
          />
        ))}
      </VStack>
    </SettingsScreenScaffold>
  );
}
