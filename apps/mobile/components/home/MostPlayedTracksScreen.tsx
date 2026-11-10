import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { Uniwind } from "uniwind";
import {
  DetailHero,
  DetailStickyHeader,
} from "@/components/DetailScreenHeader";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import PlayPauseButton from "@/components/PlayPauseButton";
import ShuffleToggle from "@/components/ShuffleToggle";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { useInfiniteMostPlayedSongs } from "@/hooks/backend/useLists";
import { useHasPlayableTracks } from "@/hooks/offline";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import { useCurrentMusicFolderIds } from "@/stores/musicFolders";
import useQueue, { type QueueSource } from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";
import { loadingData } from "@/utils/loadingData";

export default function MostPlayedTracksScreen() {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  const screenBottomPadding = useScreenBottomPadding();
  const musicFolderIds = useCurrentMusicFolderIds();
  const offsetY = useSharedValue(0);
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offsetY.value, [0, 50], [0, 1], Extrapolation.CLAMP),
  }));
  const scrollHandler = useAnimatedScrollHandler((event) => {
    offsetY.value = event.contentOffset.y;
  });
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteMostPlayedSongs({ size: 20, musicFolderIds });
  const songs = useMemo(
    () => data?.pages.flatMap((page) => page.songs?.song ?? []) ?? [],
    [data],
  );
  const heading = t("app.home.mostPlayedTracks");
  const source = useMemo<QueueSource>(
    () => ({ type: "mostPlayed", name: heading }),
    [heading],
  );
  const handleTrackPress = useTrackListPress(songs, source);
  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const trackIdSet = useMemo(() => new Set(songs.map((s) => s.id)), [songs]);
  const isPlayingFromList = !!(playingTrack && trackIdSet.has(playingTrack.id));
  const hasPlayableTracks = useHasPlayableTracks(songs);
  const shuffle = useQueue((store) => store.shuffle);
  const setShuffle = useQueue((store) => store.setShuffle);

  const handlePlayPress = () => {
    if (isPlayingFromList) {
      togglePlayPause();
      return;
    }
    if (songs.length === 0) return;
    playTracks(songs.map(childToTrack), 0, { shuffleFromRandom: true, source });
  };

  const handleShufflePress = () => {
    setShuffle(!shuffle);
  };

  return (
    <Box className="h-full">
      <DetailStickyHeader title={heading} style={headerStyle} />
      <AnimatedLegendList
        recycleItems
        onScroll={scrollHandler}
        data={isLoading ? loadingData(6) : songs}
        renderItem={({ item, index }: { item: Child; index: number }) =>
          isLoading ? (
            <TrackListItemSkeleton index={index} className="px-6" />
          ) : (
            <TrackListItem
              track={item}
              index={index}
              onPress={handleTrackPress}
              showCoverArt
              className="px-6"
            />
          )
        }
        ListHeaderComponent={
          <>
            <DetailHero title={heading} />
            <VStack className="px-6">
              <HStack className="items-center justify-end mb-4">
                <HStack className="items-center gap-x-4">
                  <ShuffleToggle
                    active={shuffle}
                    onPress={handleShufflePress}
                  />
                  <PlayPauseButton
                    isPlaying={isPlayingFromList && isPlaying}
                    onPress={handlePlayPress}
                    size={48}
                    iconSize={24}
                    color={white}
                    className="bg-emerald-500"
                    disabled={!isPlayingFromList && !hasPlayableTracks}
                  />
                </HStack>
              </HStack>
              {error && <ErrorDisplay error={error} />}
            </VStack>
          </>
        }
        ListEmptyComponent={isLoading ? null : <EmptyDisplay />}
        contentContainerStyle={{
          paddingBottom: screenBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
      />
    </Box>
  );
}
