import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import ChevronDown from "lucide-react-native/dist/esm/icons/chevron-down.mjs";
import ChevronUp from "lucide-react-native/dist/esm/icons/chevron-up.mjs";
import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import TrackListItem from "@/components/tracks/TrackListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { Child } from "@/services/openSubsonic/types";
import type { ActivityEntry, ActivitySource } from "@/stores/activity";
import type { ActivityGroup } from "@/utils/activityGrouping";
import { artworkUrl } from "@/utils/artwork";
import { cn } from "@/utils/tailwind";

interface ActivityGroupItemProps {
  group: ActivityGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onPressSource: (source: NonNullable<ActivitySource>) => void;
}

const entryToChild = (entry: ActivityEntry): Child =>
  ({
    id: entry.trackId,
    title: entry.title,
    artist: entry.artist,
    album: entry.album,
    artistId: entry.artistId,
    albumId: entry.albumId,
    coverArt: entry.coverArt,
  }) as Child;

function SourceIcon({
  type,
  color,
}: {
  type: NonNullable<ActivitySource>["type"];
  color: string;
}) {
  if (type === "artist") return <User size={32} color={color} />;
  if (type === "album") return <Disc3 size={32} color={color} />;
  return <ListMusic size={32} color={color} />;
}

function ActivityGroupItem({
  group,
  isExpanded,
  onToggle,
  onPressSource,
}: ActivityGroupItemProps) {
  const { t } = useTranslation();
  const [white, chevron] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-primary-100",
  ]) as string[];

  const count = group.entries.length;
  const isRound = group.source?.type === "artist";

  const cover =
    group.source == null ? (
      <StackedCover entries={group.entries} white={white} />
    ) : (
      <ImageWithFallback
        source={
          group.source.coverArt || group.entries[0]?.coverArt
            ? {
                uri: artworkUrl(
                  group.source.coverArt || group.entries[0]?.coverArt,
                ),
              }
            : undefined
        }
        className={cn("w-16 h-16 rounded", { "rounded-full": isRound })}
        alt={group.source.name}
        fallback={
          <Box
            className={cn(
              "w-16 h-16 rounded bg-primary-600 items-center justify-center",
              { "rounded-full": isRound },
            )}
          >
            <SourceIcon type={group.source.type} color={white} />
          </Box>
        }
      />
    );

  const title = group.source
    ? group.source.name
    : t("app.activity.plays", { count });
  const subtitle = group.source
    ? `${t("app.activity.plays", { count })} • ${t(`app.activity.types.${group.source.type}`)}`
    : null;

  const handleHeaderPress = () => {
    if (group.source) {
      onPressSource(group.source);
    } else {
      onToggle();
    }
  };

  return (
    <Box className="py-1">
      <HStack className="items-center gap-x-4">
        <FadeOutScaleDown className="flex-1" onPress={handleHeaderPress}>
          <HStack className="items-center gap-x-4">
            {cover}
            <VStack className="flex-1">
              <Heading
                className="text-white font-normal"
                size="md"
                numberOfLines={1}
              >
                {title}
              </Heading>
              {subtitle ? (
                <Text className="text-primary-100 text-sm" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </VStack>
          </HStack>
        </FadeOutScaleDown>
        <FadeOutScaleDown onPress={onToggle}>
          {isExpanded ? (
            <ChevronUp size={22} color={chevron} />
          ) : (
            <ChevronDown size={22} color={chevron} />
          )}
        </FadeOutScaleDown>
      </HStack>
      {isExpanded ? (
        <Box className="mt-2 ml-4">
          {group.entries.map((entry, index) => (
            <TrackListItem
              key={entry.trackId}
              track={entryToChild(entry)}
              index={index}
              disableSwipe
              disableFirstItemMargin
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

function StackedCover({
  entries,
  white,
}: {
  entries: ActivityEntry[];
  white: string;
}) {
  const front = entries[0];
  const back = entries[1];
  return (
    <Box className="w-16 h-16">
      {back ? (
        <Box className="absolute right-0 bottom-0">
          <ImageWithFallback
            source={
              back.coverArt ? { uri: artworkUrl(back.coverArt) } : undefined
            }
            className="w-12 h-12 rounded"
            alt={back.title}
            fallback={
              <Box className="w-12 h-12 rounded bg-primary-700 items-center justify-center">
                <AudioLines size={16} color={white} />
              </Box>
            }
          />
        </Box>
      ) : null}
      <Box className="absolute left-0 top-0">
        <ImageWithFallback
          source={
            front?.coverArt ? { uri: artworkUrl(front.coverArt) } : undefined
          }
          className="w-14 h-14 rounded border border-primary-800"
          alt={front?.title}
          fallback={
            <Box className="w-14 h-14 rounded bg-primary-600 items-center justify-center border border-primary-800">
              <AudioLines size={20} color={white} />
            </Box>
          }
        />
      </Box>
    </Box>
  );
}

export default ActivityGroupItem;
