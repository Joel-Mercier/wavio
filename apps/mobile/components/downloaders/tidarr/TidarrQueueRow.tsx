import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import DownloadProgressBar from "@/components/downloaders/DownloadProgressBar";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useCancelDownload } from "@/hooks/tidarr/useTidarrDownloads";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import type {
  TidarrQueueItem,
  TidarrQueueStatus,
} from "@/services/tidarr/types";

// Tidarr reports progress only while tiddl is downloading. The phases after it
// carry none, so the bar holds at full rather than dropping back to zero for
// work that is further along than the download it just completed — the status
// line underneath is what says which phase is running.
const PHASES_PAST_DOWNLOAD: TidarrQueueStatus[] = [
  "queue_processing",
  "processing",
  "finished",
];

function percentOf(item: TidarrQueueItem): number {
  if (item.progress && item.progress.total > 0) {
    return Math.round((item.progress.current / item.progress.total) * 100);
  }
  return PHASES_PAST_DOWNLOAD.includes(item.status) ? 100 : 0;
}

export default function TidarrQueueRow({ item }: { item: TidarrQueueItem }) {
  const { t } = useTranslation();
  const { showErrorToast } = useSettingsToast();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const cancel = useCancelDownload();

  const percent = percentOf(item);

  const handleCancel = () => {
    cancel.mutate(item.id, {
      onError: () =>
        showErrorToast(t("app.settings.downloaders.tidarr.cancelFailed")),
    });
  };

  return (
    <VStack className="gap-y-2 py-3">
      <HStack className="items-center gap-x-3">
        <VStack className="flex-1">
          <Heading
            className="text-white font-normal"
            size="sm"
            numberOfLines={1}
          >
            {item.title}
          </Heading>
          <Text className="text-primary-100 text-sm" numberOfLines={1}>
            {item.artist}
          </Text>
        </VStack>
        <FadeOutScaleDown onPress={handleCancel} disabled={cancel.isPending}>
          <X size={20} color={white} />
        </FadeOutScaleDown>
      </HStack>
      <DownloadProgressBar percent={percent} />
      <HStack className="justify-between">
        <Text className="text-primary-100 text-xs">
          {t(`app.settings.downloaders.tidarr.statuses.${item.status}`, {
            defaultValue: item.status,
          })}
        </Text>
        <Text className="text-primary-100 text-xs">{`${percent}%`}</Text>
      </HStack>
    </VStack>
  );
}
