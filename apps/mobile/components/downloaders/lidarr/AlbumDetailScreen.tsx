import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import Check from "lucide-react-native/dist/esm/icons/check.mjs";
import Download from "lucide-react-native/dist/esm/icons/download.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import { Uniwind } from "uniwind";
import DownloadProgressBar from "@/components/downloaders/lidarr/DownloadProgressBar";
import LidarrCover from "@/components/downloaders/lidarr/LidarrCover";
import ReleasePickerSheet from "@/components/downloaders/lidarr/ReleasePickerSheet";
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
  useAddAlbum,
  useDownloadAddedAlbum,
  useLidarrAddedAlbum,
  useResolvedAddDefaults,
} from "@/hooks/lidarr/useAddAlbum";
import { useLidarrQueue } from "@/hooks/lidarr/useLidarrDownloads";
import { useLidarrAlbum } from "@/hooks/lidarr/useLidarrSearch";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { albumCoverUrl } from "@/services/lidarr/images";
import useLidarr from "@/stores/lidarr";

function formatDuration(ms: number | undefined): string | undefined {
  if (!ms || ms <= 0) return undefined;
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function AlbumDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isConnected = useLidarr((store) => store.isConnected);
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [emerald500] = Uniwind.getCSSVariable([
    "--color-emerald-500",
  ]) as string[];

  const { data: album, isLoading } = useLidarrAlbum(id);
  const { data: addedAlbum } = useLidarrAddedAlbum(id);
  const { data: queue } = useLidarrQueue();
  const { defaults } = useResolvedAddDefaults();
  const addAlbum = useAddAlbum();
  const ensureAlbum = useAddAlbum();
  const downloadAdded = useDownloadAddedAlbum();
  const releaseSheetRef = useRef<BottomSheetModal>(null);
  const [releaseAlbumId, setReleaseAlbumId] = useState<number | undefined>();
  const [preparingReleases, setPreparingReleases] = useState(false);

  if (!isConnected) {
    return <Redirect href="/downloaders/lidarr" />;
  }

  const title = album?.title ?? t("app.settings.downloaders.discovery.album");

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

  const release = album.releases?.[0];
  const year = album.releaseDate?.slice(0, 4);
  const trackCount = release?.trackCount;
  const duration = formatDuration(album.duration ?? release?.duration);
  const metaParts = [
    album.albumType,
    year,
    trackCount
      ? t("app.settings.downloaders.album.trackCount", { count: trackCount })
      : undefined,
    duration,
  ].filter(Boolean);

  // "In your library" reflects the actual downloaded state, not Lidarr's
  // monitored/added state: an album can be added and monitored with zero track
  // files on disk (status 0/N in Lidarr), which is not what the user cares
  // about here.
  const stats = addedAlbum?.statistics;
  const totalTracks = stats?.totalTrackCount ?? stats?.trackCount ?? 0;
  const isDownloaded =
    totalTracks > 0 && (stats?.trackFileCount ?? 0) >= totalTracks;
  const inLidarr = !!addedAlbum;
  const isBusy = addAlbum.isPending || downloadAdded.isPending;

  // Live download state: match this album against the Lidarr queue by internal
  // id (once known) or by title + artist, so the screen reflects an in-progress
  // download instead of staying on the "Download" button.
  const queueItem = (queue ?? []).find(
    (q) =>
      (addedAlbum?.id != null && q.albumId === addedAlbum.id) ||
      (q.albumTitle.toLowerCase() === album.title.toLowerCase() &&
        q.artistName.toLowerCase() ===
          (album.artist?.artistName ?? "").toLowerCase()),
  );
  const isDownloading = !isDownloaded && !!queueItem;

  const handlePrimary = () => {
    // Already in Lidarr (e.g. added unmonitored while browsing the artist) →
    // monitor + search instead of re-adding (POST /album would fail).
    if (inLidarr && addedAlbum?.id != null) {
      downloadAdded.mutate(addedAlbum.id, {
        onSuccess: () =>
          showSuccessToast(
            t("app.settings.downloaders.album.searchStartedMessage"),
          ),
        onError: () =>
          showErrorToast(t("app.settings.downloaders.album.addFailed")),
      });
      return;
    }
    if (!defaults) {
      showErrorToast(t("app.settings.downloaders.album.noRootFolder"));
      return;
    }
    addAlbum.mutate(
      { album, defaults },
      {
        onSuccess: () =>
          showSuccessToast(t("app.settings.downloaders.album.addedMessage")),
        onError: () =>
          showErrorToast(t("app.settings.downloaders.album.addFailed")),
      },
    );
  };

  const handleChooseRelease = () => {
    if (addedAlbum?.id != null) {
      setReleaseAlbumId(addedAlbum.id);
      releaseSheetRef.current?.present();
      return;
    }
    if (!defaults) {
      showErrorToast(t("app.settings.downloaders.album.noRootFolder"));
      return;
    }
    // Interactive search needs the album to exist in Lidarr, so add it without
    // an automatic search first, then open the picker on the returned id.
    setPreparingReleases(true);
    ensureAlbum.mutate(
      { album, defaults, search: false },
      {
        onSuccess: (created) => {
          if (created?.id != null) {
            setReleaseAlbumId(created.id);
            releaseSheetRef.current?.present();
          }
        },
        onError: () =>
          showErrorToast(t("app.settings.downloaders.album.addFailed")),
        onSettled: () => setPreparingReleases(false),
      },
    );
  };

  return (
    <SettingsScreenScaffold
      title={title}
      overlays={
        <ReleasePickerSheet
          sheetRef={releaseSheetRef}
          albumId={releaseAlbumId}
        />
      }
    >
      <VStack className="items-center gap-y-4 py-2">
        <LidarrCover url={albumCoverUrl(album)} size={220} variant="album" />
        <VStack className="items-center gap-y-1">
          <Heading className="text-white text-center" size="xl">
            {album.title}
          </Heading>
          {album.artist?.artistName && (
            <Text
              className="text-emerald-400 text-center text-lg"
              onPress={() =>
                album.artist &&
                router.navigate({
                  pathname: "/downloaders/artist/[id]",
                  params: {
                    id: album.artist.foreignArtistId,
                    name: album.artist.artistName,
                  },
                })
              }
            >
              {album.artist.artistName}
            </Text>
          )}
          {metaParts.length > 0 && (
            <Text className="text-primary-100 text-center text-sm">
              {metaParts.join(" · ")}
            </Text>
          )}
        </VStack>

        {isDownloaded ? (
          <HStack className="items-center gap-x-2 py-3 px-8 border border-emerald-500 rounded-full">
            <Check size={20} color="rgb(52, 211, 153)" />
            <Text className="text-emerald-400 font-bold text-lg">
              {t("app.settings.downloaders.album.inLibrary")}
            </Text>
          </HStack>
        ) : isDownloading && queueItem ? (
          <VStack className="w-full gap-y-2 px-2">
            <HStack className="items-center justify-center gap-x-2">
              <Spinner color={emerald500} />
              <Text className="text-emerald-400 font-bold text-lg">
                {t("app.settings.downloaders.album.downloading", {
                  percent: queueItem.percentComplete,
                })}
              </Text>
            </HStack>
            <DownloadProgressBar percent={queueItem.percentComplete} />
          </VStack>
        ) : (
          <FadeOutScaleDown
            disabled={isBusy}
            onPress={handlePrimary}
            className="flex-row items-center justify-center gap-x-2 py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
          >
            {isBusy ? (
              <Spinner color="rgb(41, 41, 41)" />
            ) : (
              <>
                <Download size={20} color="rgb(41, 41, 41)" />
                <Text className="text-primary-800 font-bold text-lg">
                  {inLidarr
                    ? t("app.settings.downloaders.album.downloadAction")
                    : t("app.settings.downloaders.album.addAction")}
                </Text>
              </>
            )}
          </FadeOutScaleDown>
        )}

        {!isDownloading && (
          <FadeOutScaleDown
            disabled={preparingReleases}
            onPress={handleChooseRelease}
            className="flex-row items-center justify-center gap-x-2 py-3 px-8 border border-white rounded-full"
          >
            {preparingReleases ? (
              <Spinner color="white" />
            ) : (
              <>
                <ListMusic size={20} color="white" />
                <Text className="text-white font-bold text-lg">
                  {t("app.settings.downloaders.album.chooseReleaseAction")}
                </Text>
              </>
            )}
          </FadeOutScaleDown>
        )}

        {album.overview ? (
          <Text className="text-primary-100 text-sm mt-2" numberOfLines={6}>
            {album.overview}
          </Text>
        ) : null}
      </VStack>
    </SettingsScreenScaffold>
  );
}
