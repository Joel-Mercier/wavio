import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import HomeSection from "@/components/home/sections/HomeSection";
import SongCardSkeleton from "@/components/home/sections/SongCardSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useNowPlaying } from "@/hooks/backend/useLists";
import type { NowPlayingEntry } from "@/services/openSubsonic/types";
import { playTracks } from "@/services/player";
import { useAuthBase } from "@/stores/auth";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";
import { loadingData } from "@/utils/loadingData";

function NowPlayingCard({ entry }: { entry: NowPlayingEntry }) {
  const [white, emerald] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
  ]) as string[];
  return (
    <FadeOutScaleDown
      onPress={() => playTracks([childToTrack(entry)], 0)}
      className="mr-6"
    >
      <VStack className="w-32 gap-y-2">
        {entry.coverArt ? (
          <Image
            source={{ uri: artworkUrl(entry.coverArt) }}
            className="w-32 h-32 rounded-md aspect-square"
            alt="Track cover"
          />
        ) : (
          <Box className="w-32 h-32 aspect-square rounded-md bg-primary-600 items-center justify-center">
            <AudioLines size={48} color={white} />
          </Box>
        )}
        <VStack>
          <Heading size="sm" className="text-white" numberOfLines={1}>
            {entry.title}
          </Heading>
          <Text numberOfLines={1} className="text-md text-primary-100">
            {entry.artist}
          </Text>
          <HStack className="items-center gap-x-2">
            <AudioLines size={16} color={emerald} />
            <Text numberOfLines={1} className="text-sm text-emerald-500">
              {entry.username}
            </Text>
          </HStack>
        </VStack>
      </VStack>
    </FadeOutScaleDown>
  );
}

export default function NowPlayingSection({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const username = useAuthBase((state) => state.username);
  const { data, isLoading, error } = useNowPlaying({ enabled });
  // Other people's activity only — seeing your own playback here isn't useful.
  const entries = data?.nowPlaying?.entry?.filter(
    (entry) => entry.username !== username,
  );
  return (
    <HomeSection
      title={t("app.home.sections.nowPlaying")}
      isLoading={!enabled || isLoading}
      error={error}
      isEmpty={!entries?.length}
      skeleton={loadingData(4).map((_, index) => (
        <SongCardSkeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
          key={`now-playing-skeleton-${index}`}
        />
      ))}
    >
      {entries?.map((entry) => (
        <NowPlayingCard key={`${entry.id}-${entry.username}`} entry={entry} />
      ))}
    </HomeSection>
  );
}
