import { useTranslation } from "react-i18next";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { ActivityEntry } from "@/stores/activity";
import { artworkUrl } from "@/utils/artwork";
import { formatDistanceToNow } from "@/utils/date";

interface ActivityListItemProps {
  item: ActivityEntry;
  onPress: (entry: ActivityEntry) => void;
}

export default function ActivityListItem({
  item,
  onPress,
}: ActivityListItemProps) {
  const { t } = useTranslation();

  return (
    <FadeOutScaleDown onPress={() => onPress(item)}>
      <HStack className="items-center gap-x-4 py-2">
        <Image
          source={{ uri: artworkUrl(item.coverArt) }}
          className="w-16 h-16 rounded"
          alt={item.title}
        />
        <VStack className="flex-1">
          <Heading
            className="text-white font-normal flex-1 truncate"
            size="md"
            numberOfLines={1}
          >
            {item.title}
          </Heading>
          <HStack className="items-center gap-x-2">
            <Text className="text-primary-100 text-sm" numberOfLines={1}>
              {item.artist
                ? `${t(`app.activity.types.${item.type}`)} • ${item.artist}`
                : t(`app.activity.types.${item.type}`)}
            </Text>
          </HStack>
          <Text className="text-primary-100 text-xs" numberOfLines={1}>
            {t("app.activity.playedAt", {
              distance: formatDistanceToNow(new Date(item.playedAt)),
            })}
          </Text>
        </VStack>
      </HStack>
    </FadeOutScaleDown>
  );
}
