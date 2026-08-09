import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { useSectionEnabled } from "@/components/home/enabledSections";
import HomeSection from "@/components/home/sections/HomeSection";
import { SONG_CAROUSEL_SKELETON } from "@/components/home/sections/skeletons";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useNowPlaying } from "@/hooks/backend/useLists";
import { useIsTrackAvailableOffline } from "@/hooks/offline";
import { useIsOnline } from "@/hooks/useIsOnline";
import type { NowPlayingEntry } from "@/services/openSubsonic/types";
import { playTracks } from "@/services/player";
import { useAuthBase } from "@/stores/auth";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";

const NowPlayingCard = memo(function NowPlayingCard({
  entry,
}: {
  entry: NowPlayingEntry;
}) {
  const [white, emerald] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
  ]) as string[];
  const isTrackDownloaded = useIsTrackAvailableOffline(entry.id);
  const isOnline = useIsOnline();
  return (
    <FadeOutScaleDown
      onPress={() => playTracks([childToTrack(entry)], 0)}
      disabled={!isOnline && !isTrackDownloaded}
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
});

function NowPlayingSection({ sectionIndex }: { sectionIndex: number }) {
  const enabled = useSectionEnabled(sectionIndex);
  const { t } = useTranslation();
  const username = useAuthBase((state) => state.username);
  const { data, isLoading, error } = useNowPlaying({ enabled });
  // Other people's activity only — seeing your own playback here isn't useful.
  const entries = useMemo(
    () =>
      data?.nowPlaying?.entry?.filter((entry) => entry.username !== username),
    [data?.nowPlaying?.entry, username],
  );
  return (
    <HomeSection
      title={t("app.home.sections.nowPlaying")}
      isLoading={!enabled || isLoading}
      error={error}
      isEmpty={!entries?.length}
      skeleton={SONG_CAROUSEL_SKELETON}
    >
      {entries?.map((entry) => (
        <NowPlayingCard key={`${entry.id}-${entry.username}`} entry={entry} />
      ))}
    </HomeSection>
  );
}

export default memo(NowPlayingSection);
