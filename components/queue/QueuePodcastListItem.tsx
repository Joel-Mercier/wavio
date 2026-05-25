import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Podcast from "lucide-react-native/dist/esm/icons/podcast.mjs";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { usePodcastEpisodeActions } from "@/components/podcasts/PodcastEpisodeActionsProvider";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useIsCurrentTrack } from "@/hooks/player";
import type { PodcastSeries } from "@/services/taddyPodcasts/types";
import type { QueueTrack } from "@/stores/queue";
import { cn } from "@/utils/tailwind";

interface QueuePodcastListItemProps {
  track: QueueTrack;
  index: number;
  onPress?: (index: number, track: QueueTrack) => void;
}

export default function QueuePodcastListItem({
  track,
  index,
  onPress,
}: QueuePodcastListItemProps) {
  const [white, gray300] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-300",
  ]) as string[];
  const isCurrentTrack = useIsCurrentTrack(track.id);
  const { open } = usePodcastEpisodeActions();

  const handlePresentModalPress = () => {
    const series = track.podcastSeries as PodcastSeries | undefined;
    if (!series) return;
    open({
      uuid: track.id,
      name: track.title ?? "",
      imageUrl: track.artwork,
      podcastSeries: series,
      seriesName: track.artist,
    });
  };

  const handlePress = () => onPress?.(index, track);

  return (
    <Pressable onPress={handlePress}>
      <HStack
        className={cn("items-center justify-between mb-4", {
          "mt-6": index === 0,
        })}
      >
        <HStack className="items-center flex-1">
          {track.artwork ? (
            <Image
              source={{ uri: track.artwork }}
              className="w-16 h-16 rounded-md aspect-square"
              alt="Podcast cover"
            />
          ) : (
            <Box className="w-16 h-16 aspect-square rounded-md bg-primary-600 items-center justify-center">
              <Podcast size={24} color={white} />
            </Box>
          )}
          <VStack className="flex-1 ml-4">
            <Heading
              className={cn("text-white text-md font-normal capitalize mr-4", {
                "text-emerald-500": isCurrentTrack,
              })}
              numberOfLines={1}
            >
              {track.title}
            </Heading>
            <Text numberOfLines={1} className="text-md text-primary-100">
              {track.artist}
            </Text>
          </VStack>
        </HStack>
        <HStack className="items-center">
          <FadeOutScaleDown onPress={handlePresentModalPress}>
            <EllipsisVertical color={gray300} />
          </FadeOutScaleDown>
        </HStack>
      </HStack>
    </Pressable>
  );
}
