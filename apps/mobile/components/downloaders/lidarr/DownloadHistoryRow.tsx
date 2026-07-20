import { useTranslation } from "react-i18next";
import LidarrCover from "@/components/downloaders/lidarr/LidarrCover";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { LidarrHistoryItem } from "@/services/lidarr/history";

export default function DownloadHistoryRow({
  item,
}: {
  item: LidarrHistoryItem;
}) {
  const { t } = useTranslation();
  const date = item.date ? new Date(item.date).toLocaleDateString() : undefined;
  const eventLabel = t(
    `app.settings.downloaders.downloads.events.${item.eventType}`,
    { defaultValue: item.eventType },
  );
  // Lidarr's history is per-track, so lead with the track title (falling back to
  // the album) and show "artist · album" underneath. Otherwise every track of an
  // album looks like a duplicate row.
  const primary = item.trackTitle || item.albumTitle;
  const secondary = item.trackTitle
    ? `${item.artistName} · ${item.albumTitle}`
    : item.artistName;

  return (
    <HStack className="items-center gap-x-3 py-3">
      <LidarrCover url={item.coverUrl} size={44} variant="album" />
      <VStack className="flex-1">
        <Heading className="text-white font-normal" size="sm" numberOfLines={1}>
          {primary}
        </Heading>
        <Text className="text-primary-100 text-sm" numberOfLines={1}>
          {secondary}
        </Text>
      </VStack>
      <VStack className="items-end">
        <Text className="text-emerald-400 text-xs">{eventLabel}</Text>
        {date && <Text className="text-primary-100 text-xs">{date}</Text>}
      </VStack>
    </HStack>
  );
}
