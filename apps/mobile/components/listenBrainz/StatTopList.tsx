import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import ImageWithFallback from "@/components/ImageWithFallback";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { TopStatItem } from "@/services/listenBrainz/statsMappers";

// Rows are not tappable: these entities live in ListenBrainz's own catalogue
// and nothing here resolves them to something the active music server can play,
// so a press would have nowhere to go.
export default function StatTopList({
  items,
  showArtwork = false,
}: {
  items: TopStatItem[];
  showArtwork?: boolean;
}) {
  return (
    // The charts carry their own vertical padding; a list starts at its first
    // row, so it needs the breathing room under the section heading itself.
    <VStack className="gap-y-3 mt-2">
      {items.map((item) => (
        <HStack key={item.key} className="items-center gap-x-3">
          <Text className="text-primary-300 text-sm w-5 text-right">
            {item.rank}
          </Text>
          {showArtwork && (
            <ImageWithFallback
              source={item.artworkUrl}
              alt={item.title}
              className="w-10 h-10 rounded-md"
              fallback={
                <Box className="w-10 h-10 rounded-md bg-primary-600 items-center justify-center">
                  <Disc3 size={18} color="rgb(163, 163, 163)" />
                </Box>
              }
            />
          )}
          <VStack className="flex-1">
            <Text className="text-white text-md" numberOfLines={1}>
              {item.title}
            </Text>
            {item.subtitle && (
              <Text className="text-primary-100 text-sm" numberOfLines={1}>
                {item.subtitle}
              </Text>
            )}
          </VStack>
          <Text className="text-primary-100 text-sm">{item.listenCount}</Text>
        </HStack>
      ))}
    </VStack>
  );
}

export function StatTopListSkeleton({
  rows = 5,
  showArtwork = false,
}: {
  rows?: number;
  showArtwork?: boolean;
}) {
  return (
    <VStack className="gap-y-3 mt-2">
      {Array.from({ length: rows }, (_, index) => (
        <HStack
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder rows
          key={index}
          className="items-center gap-x-3"
        >
          <Box className="w-5" />
          {showArtwork && (
            <Skeleton
              className="w-10 h-10 rounded-md"
              variant="rounded"
              startColor="bg-primary-400"
              speed={4}
            />
          )}
          <SkeletonText
            className="h-3 flex-1"
            _lines={1}
            startColor="bg-primary-400"
            speed={4}
          />
        </HStack>
      ))}
    </VStack>
  );
}
