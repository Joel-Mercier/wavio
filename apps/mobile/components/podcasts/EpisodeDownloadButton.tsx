import CircleCheckBig from "lucide-react-native/dist/esm/icons/circle-check-big.mjs";
import Download from "lucide-react-native/dist/esm/icons/download.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import {
  useDownloadProgress,
  useIsTrackAvailableOffline,
} from "@/hooks/offline";
import { parseLocalPodcastEpisodeId } from "@/services/local/keys";
import { offlineDownloadService } from "@/services/offline";
import type { PodcastEpisode } from "@/services/openSubsonic/types";

interface EpisodeDownloadButtonProps {
  episode: PodcastEpisode;
  seriesName?: string;
  channelCoverArt?: string;
  size?: number;
}

// Download / downloading / downloaded for one self-hosted episode, shared by the
// episode row and the episode screen so both read the same state and write the
// same track fields.
export default function EpisodeDownloadButton({
  episode,
  seriesName,
  channelCoverArt,
  size = 22,
}: EpisodeDownloadButtonProps) {
  const [white, emerald] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const toast = useToast();

  // Self-hosted (local) episodes stream from a remote enclosure URL and can be
  // downloaded on-device for offline playback through the shared offline
  // pipeline. The episode id encodes that URL (see services/local/keys.ts), so
  // its presence is the precise "downloadable on this device" signal.
  const downloadable =
    episode.streamId != null &&
    parseLocalPodcastEpisodeId(episode.streamId) != null;
  const isDownloaded = useIsTrackAvailableOffline(episode.id);
  const progress = useDownloadProgress(episode.id);
  const isDownloading =
    progress?.status === "downloading" || progress?.status === "pending";

  const handleDownloadPress = async () => {
    try {
      await offlineDownloadService.downloadTrack({
        ...episode,
        artist: episode.artist || seriesName,
        coverArt: episode.coverArt || channelCoverArt,
      });
    } catch {
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.podcasts.downloadEpisodeErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  if (!downloadable) return null;

  if (isDownloaded) {
    return (
      <FadeOutScaleDown
        onPress={() => offlineDownloadService.removeDownloadedTrack(episode.id)}
      >
        <CircleCheckBig size={size} color={emerald} />
      </FadeOutScaleDown>
    );
  }

  if (isDownloading) {
    return (
      <Text className="text-primary-100 text-sm">
        {`${Math.round(progress?.progress ?? 0)}%`}
      </Text>
    );
  }

  return (
    <FadeOutScaleDown onPress={handleDownloadPress}>
      <Download size={size} color={white} />
    </FadeOutScaleDown>
  );
}
