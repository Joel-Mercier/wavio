import DownloaderCover from "@/components/downloaders/DownloaderCover";
import DownloadProgressBar from "@/components/downloaders/DownloadProgressBar";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { SoulSyncQueueItem } from "@/services/soulsync/downloads";
import { niceBytes } from "@/utils/fileSize";

export default function SoulSyncQueueRow({
  item,
  artworkUrl,
}: {
  item: SoulSyncQueueItem;
  artworkUrl?: string;
}) {
  return (
    <VStack className="gap-y-2 py-3">
      <HStack className="items-center gap-x-3">
        <DownloaderCover url={artworkUrl} size={48} />
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
      </HStack>
      <DownloadProgressBar percent={item.percentComplete} />
      <HStack className="justify-between">
        <Text className="text-primary-100 text-xs" numberOfLines={1}>
          {item.errorMessage ?? item.status ?? ""}
        </Text>
        <Text className="text-primary-100 text-xs">
          {item.size > 0
            ? `${niceBytes(item.size)} · ${item.percentComplete}%`
            : `${item.percentComplete}%`}
        </Text>
      </HStack>
    </VStack>
  );
}
