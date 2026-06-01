import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { ActivityEntry, ActivityType } from "@/stores/activity";
import { artworkUrl } from "@/utils/artwork";
import { formatDistanceToNow } from "@/utils/date";
import { cn } from "@/utils/tailwind";

interface ActivityListItemProps {
  item: ActivityEntry;
  onPress: (entry: ActivityEntry) => void;
}

function ActivityListItemIcon({ type }: { type: ActivityType }) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  if (type === "artist") {
    return <User size={32} color={white} />;
  }
  if (type === "album") {
    return <Disc3 size={32} color={white} />;
  }
  return <ListMusic size={32} color={white} />;
}

export default function ActivityListItem({
  item,
  onPress,
}: ActivityListItemProps) {
  const { t } = useTranslation();

  return (
    <FadeOutScaleDown onPress={() => onPress(item)}>
      <HStack className="items-center gap-x-4 py-2">
        <ImageWithFallback
          source={
            item.coverArt ? { uri: artworkUrl(item.coverArt) } : undefined
          }
          className={cn("w-16 h-16 rounded", {
            "rounded-full": item.type === "artist",
          })}
          alt={item.title}
          fallback={
            <Box
              className={cn(
                "w-16 h-16 rounded bg-primary-600 items-center justify-center",
                { "rounded-full": item.type === "artist" },
              )}
            >
              <ActivityListItemIcon type={item.type} />
            </Box>
          }
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
