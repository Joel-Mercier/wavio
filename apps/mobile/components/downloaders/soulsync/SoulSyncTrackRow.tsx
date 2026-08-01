import CircleCheck from "lucide-react-native/dist/esm/icons/circle-check.mjs";
import CircleX from "lucide-react-native/dist/esm/icons/circle-x.mjs";
import Download from "lucide-react-native/dist/esm/icons/download.mjs";
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
  useRequestTrack,
  useTrackRequest,
} from "@/hooks/soulsync/useTrackRequest";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import type { SoulSyncTrack } from "@/services/soulsync/types";

export default function SoulSyncTrackRow({ track }: { track: SoulSyncTrack }) {
  const { t } = useTranslation();
  const { showErrorToast } = useSettingsToast();
  const [white, emerald500, red500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
    "--color-red-500",
  ]) as string[];

  const request = useRequestTrack();
  const { status, progress, errorMessage, isWorking } = useTrackRequest(
    track.id,
  );

  const handleRequest = () => {
    request.mutate(track, {
      onError: () =>
        showErrorToast(t("app.settings.downloaders.soulsync.requestFailed")),
    });
  };

  const statusLabel = () => {
    switch (status) {
      case "pending":
      case "queued":
        return t("app.settings.downloaders.soulsync.statusQueued");
      case "downloading":
        return progress
          ? t("app.settings.downloaders.soulsync.statusDownloadingPercent", {
              percent: Math.round(progress),
            })
          : t("app.settings.downloaders.soulsync.statusDownloading");
      case "importing":
        return t("app.settings.downloaders.soulsync.statusImporting");
      case "completed":
        return t("app.settings.downloaders.soulsync.statusCompleted");
      case "failed":
        // SoulSync's own reason is more specific than anything we could say,
        // and it's what the wishlist row will show on retry.
        return (
          errorMessage ?? t("app.settings.downloaders.soulsync.statusFailed")
        );
      case "unknown":
        return t("app.settings.downloaders.soulsync.statusUnavailable");
      default:
        return null;
    }
  };

  const label = statusLabel();

  return (
    <VStack className="px-6 py-3 gap-y-1">
      <HStack className="items-center gap-x-3">
        <DownloaderCover url={track.image_url ?? undefined} size={48} />
        <VStack className="flex-1">
          <Heading
            className="text-white font-normal"
            size="sm"
            numberOfLines={1}
          >
            {track.name}
          </Heading>
          <Text className="text-primary-100 text-sm" numberOfLines={1}>
            {track.artists?.join(", ")}
            {track.album ? ` · ${track.album}` : ""}
          </Text>
        </VStack>
        {isWorking ? (
          <Spinner color={emerald500} />
        ) : status === "completed" ? (
          <CircleCheck size={22} color={emerald500} />
        ) : status === "failed" || status === "unknown" ? (
          <CircleX size={22} color={red500} />
        ) : (
          <FadeOutScaleDown onPress={handleRequest}>
            <Download size={22} color={white} />
          </FadeOutScaleDown>
        )}
      </HStack>
      {label && (
        <Text className="text-primary-100 text-xs pl-[60px]">{label}</Text>
      )}
    </VStack>
  );
}
