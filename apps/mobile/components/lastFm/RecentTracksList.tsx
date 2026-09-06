import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import Heart from "lucide-react-native/dist/esm/icons/heart.mjs";
import { useTranslation } from "react-i18next";
import ImageWithFallback from "@/components/ImageWithFallback";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { LastFmRecentTrack } from "@/services/lastFm/types";
import { formatDistanceToNow } from "@/utils/date";

const KEY = "app.settings.integrations.lastfm.stats";

// Like StatTopList, rows are not tappable: these name Last.fm's catalogue, not
// anything the active music server can be asked to play.
export default function RecentTracksList({
  tracks,
}: {
  tracks: LastFmRecentTrack[];
}) {
  const { t } = useTranslation();

  return (
    <VStack className="gap-y-3 mt-2">
      {tracks.map((track) => (
        <HStack key={track.key} className="items-center gap-x-3">
          <ImageWithFallback
            source={track.artworkUrl}
            alt={track.name}
            className="w-10 h-10 rounded-md"
            fallback={
              <Box className="w-10 h-10 rounded-md bg-primary-600 items-center justify-center">
                <Disc3 size={18} color="rgb(163, 163, 163)" />
              </Box>
            }
          />
          <VStack className="flex-1">
            <HStack className="items-center gap-x-2">
              <Text className="text-white text-md shrink" numberOfLines={1}>
                {track.name}
              </Text>
              {track.loved && (
                <Heart
                  size={12}
                  color="rgb(52, 211, 153)"
                  fill="rgb(52, 211, 153)"
                />
              )}
            </HStack>
            <Text className="text-primary-100 text-sm" numberOfLines={1}>
              {track.artist}
            </Text>
          </VStack>
          <Text className="text-primary-300 text-xs">
            {track.nowPlaying
              ? t(`${KEY}.nowPlaying`)
              : track.playedAt
                ? formatDistanceToNow(new Date(track.playedAt * 1000))
                : ""}
          </Text>
        </HStack>
      ))}
    </VStack>
  );
}

export function RecentTracksListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <VStack className="gap-y-3 mt-2">
      {Array.from({ length: rows }, (_, index) => (
        <HStack
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder rows
          key={index}
          className="items-center gap-x-3"
        >
          <Skeleton
            className="w-10 h-10 rounded-md"
            variant="rounded"
            startColor="bg-primary-400"
            speed={4}
          />
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
