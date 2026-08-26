import { useRouter } from "expo-router";
import CircleCheck from "lucide-react-native/dist/esm/icons/circle-check.mjs";
import Download from "lucide-react-native/dist/esm/icons/download.mjs";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import DownloaderCover from "@/components/downloaders/DownloaderCover";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
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
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { albumQueueItem } from "@/services/tidarr/download";
import { tidalCoverUrl } from "@/services/tidarr/images";
import type { TidalAlbum } from "@/services/tidarr/types";

// The row opens the album and the trailing icon queues it; the two pressables
// are siblings rather than nested, or the outer one would swallow the tap.
// `isDownloaded` only marks the row: Tidarr's history is a bare list of ids
// whose album and track spaces overlap, so a false positive must never take the
// download away.
function TidarrAlbumRow({
  album,
  isDownloaded,
}: {
  album: TidalAlbum;
  isDownloaded?: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [white, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
  ]) as string[];
  const quality = useQueueQuality();
  const enqueue = useEnqueue();
  const isEnqueuing = useIsEnqueuing("album", album.id);

  const handleDownload = () => {
    enqueue.mutate(albumQueueItem(album, quality), {
      onSuccess: () =>
        showSuccessToast(t("app.settings.downloaders.tidarr.queuedMessage")),
      onError: () =>
        showErrorToast(t("app.settings.downloaders.tidarr.queueFailed")),
    });
  };

  const subtitleParts = [
    album.artists?.[0]?.name,
    album.releaseDate?.slice(0, 4),
  ].filter(Boolean);

  return (
    <HStack className="items-center gap-x-3 py-3">
      <FadeOutScaleDown
        className="flex-1"
        onPress={() => router.navigate(`/downloaders/tidarr/album/${album.id}`)}
      >
        <HStack className="items-center gap-x-3">
          <DownloaderCover url={tidalCoverUrl(album.cover)} size={48} />
          <VStack className="flex-1">
            <Heading
              className="text-white font-normal"
              size="sm"
              numberOfLines={1}
            >
              {album.title}
            </Heading>
            <Text className="text-primary-100 text-sm" numberOfLines={1}>
              {subtitleParts.join(" · ")}
            </Text>
          </VStack>
        </HStack>
      </FadeOutScaleDown>
      {isEnqueuing ? (
        <Spinner color={emerald500} />
      ) : (
        <HStack className="items-center gap-x-3">
          {isDownloaded && <CircleCheck size={22} color={emerald500} />}
          <FadeOutScaleDown onPress={handleDownload}>
            <Download size={22} color={white} />
          </FadeOutScaleDown>
        </HStack>
      )}
    </HStack>
  );
}

// Rows re-render on every keystroke in the search field otherwise: the
// query state lives on the screen above them.
export default memo(TidarrAlbumRow);
