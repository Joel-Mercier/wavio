import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import type { PodcastSeries } from "@/services/taddyPodcasts/types";
import { cn } from "@/utils/tailwind";
import { Podcast } from "lucide-react-native";

interface PodcastSeriesListItemProps {
  podcast: PodcastSeries;
  index: number;
  layout?: "vertical" | "horizontal";
  className?: string;
}

export default function PodcastSeriesListItem({
  podcast,
  index,
  layout = "vertical",
  className = "",
}: PodcastSeriesListItemProps) {
  return (
    <FadeOutScaleDown
      href={{
        pathname: `/(tabs)/(home)/podcast-series/${podcast.uuid}`,
        params: {
          ...podcast,
        },
      }}
      className={cn(className, {
        "mt-0": layout === "vertical" && index === 0,
        "pt-4": layout === "vertical" && index !== 0,
        "px-6": layout === "vertical",
        "mr-6": layout === "horizontal",
      })}
    >
      <VStack
        className={cn("transition duration-100 gap-y-2", {
          "w-32": layout === "horizontal",
          "flex-row items-center": layout === "vertical",
        })}
      >
        {podcast.imageUrl ? (
          <Image
            source={{ uri: podcast.imageUrl }}
            className="w-32 h-32 rounded-md aspect-square"
            alt="Album cover"
          />
        ) : (
          <Box className="w-32 h-32 rounded-md bg-primary-600 items-center justify-center">
            <Podcast size={48} color={themeConfig.theme.colors.white} />
          </Box>
        )}
        <VStack className={cn({ "flex-col ml-4": layout === "vertical" })}>
          <Heading
            size={layout === "horizontal" ? "sm" : "lg"}
            className="text-white"
            numberOfLines={1}
          >
            {podcast.name}
          </Heading>
          <Text numberOfLines={2} className="text-md text-primary-100">
            {podcast.authorName}
          </Text>
        </VStack>
      </VStack>
    </FadeOutScaleDown>
  );
}
