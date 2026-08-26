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
import { trackQueueItem } from "@/services/tidarr/download";
import { tidalCoverUrl } from "@/services/tidarr/images";
import type { TidalTrack } from "@/services/tidarr/types";

// `showCover` is off inside an album's tracklist, where every row would repeat
// the cover already shown in the header. `isDownloaded` only marks the row —
// see TidarrAlbumRow for why the download stays available either way.
function TidarrTrackRow({
  track,
  showCover = true,
  isDownloaded,
}: {
  track: TidalTrack;
  showCover?: boolean;
  isDownloaded?: boolean;
}) {
  const { t } = useTranslation();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [white, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
  ]) as string[];
  const quality = useQueueQuality();
  const enqueue = useEnqueue();
  const isEnqueuing = useIsEnqueuing("track", track.id);

  const handleDownload = () => {
    enqueue.mutate(trackQueueItem(track, quality), {
      onSuccess: () =>
        showSuccessToast(t("app.settings.downloaders.tidarr.queuedMessage")),
      onError: () =>
        showErrorToast(t("app.settings.downloaders.tidarr.queueFailed")),
    });
  };

  const subtitleParts = [track.artists?.[0]?.name, track.album?.title].filter(
    Boolean,
  );

  return (
    <HStack className="items-center gap-x-3 py-3">
      {showCover ? (
        <DownloaderCover url={tidalCoverUrl(track.album?.cover)} size={48} />
      ) : (
        <Text className="text-primary-100 text-sm w-6 text-center">
          {track.trackNumber ?? ""}
        </Text>
      )}
      <VStack className="flex-1">
        <Heading className="text-white font-normal" size="sm" numberOfLines={1}>
          {track.title}
        </Heading>
        {subtitleParts.length > 0 && (
          <Text className="text-primary-100 text-sm" numberOfLines={1}>
            {subtitleParts.join(" · ")}
          </Text>
        )}
      </VStack>
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
export default memo(TidarrTrackRow);
