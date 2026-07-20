import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import DownloadProgressBar from "@/components/downloaders/lidarr/DownloadProgressBar";
import LidarrCover from "@/components/downloaders/lidarr/LidarrCover";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useCancelDownload } from "@/hooks/lidarr/useLidarrDownloads";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import type { LidarrQueueItem } from "@/services/lidarr";
import { niceBytes } from "@/utils/fileSize";

export default function DownloadQueueRow({ item }: { item: LidarrQueueItem }) {
  const { t } = useTranslation();
  const { showErrorToast } = useSettingsToast();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const cancel = useCancelDownload();

  const downloaded = item.size - item.sizeleft;
  const handleCancel = () => {
    cancel.mutate(item, {
      onError: () =>
        showErrorToast(t("app.settings.downloaders.downloads.cancelFailed")),
    });
  };

  return (
    <VStack className="gap-y-2 py-3">
      <HStack className="items-center gap-x-3">
        <LidarrCover url={item.coverUrl} size={48} variant="album" />
        <VStack className="flex-1">
          <Heading
            className="text-white font-normal"
            size="sm"
            numberOfLines={1}
          >
            {item.albumTitle}
          </Heading>
          <Text className="text-primary-100 text-sm" numberOfLines={1}>
            {item.artistName}
          </Text>
        </VStack>
        <FadeOutScaleDown onPress={handleCancel} disabled={cancel.isPending}>
          <X size={20} color={white} />
        </FadeOutScaleDown>
      </HStack>
      <DownloadProgressBar percent={item.percentComplete} />
      <HStack className="justify-between">
        <Text className="text-primary-100 text-xs">
          {item.errorMessage
            ? item.errorMessage
            : (item.trackedDownloadState ?? item.status ?? "")}
        </Text>
        <Text className="text-primary-100 text-xs">
          {item.size > 0
            ? `${niceBytes(downloaded)} / ${niceBytes(item.size)} · ${item.percentComplete}%`
            : `${item.percentComplete}%`}
        </Text>
      </HStack>
    </VStack>
  );
}
