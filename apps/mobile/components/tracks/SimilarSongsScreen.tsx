import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { useLocalSearchParams } from "expo-router";
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
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useSimilarTracks } from "@/hooks/backend/useBrowsing";
import { useHasPlayableTracks } from "@/hooks/offline";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import useQueue, { type QueueSource } from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";
import { loadingData } from "@/utils/loadingData";

export default function SimilarSongsScreen() {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  const screenBottomPadding = useScreenBottomPadding();
  const offsetY = useSharedValue(0);
  const headerStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(offsetY.value, [0, 50], [0, 1], Extrapolation.CLAMP),
    };
  });
  const scrollHandler = useAnimatedScrollHandler((event) => {
    offsetY.value = event.contentOffset.y;
  });
  const { id, title, artist } = useLocalSearchParams<{
    id: string;
    title?: string;
    artist?: string;
  }>();
  // Carried in the route params rather than refetched: the Last.fm tier needs
  // the artist name, and the sheet that opened this screen already had it.
  const seed = useMemo(() => ({ title, artist }), [title, artist]);
  const {
    data: songs,
    isLoading,
    error,
  } = useSimilarTracks(id, { count: 50 }, seed);
  const heading = t("app.tracks.similarSongsTitle", { title: title ?? "" });
  const similarSource = useMemo<QueueSource>(
    () => ({ type: "similar", name: title ?? "" }),
    [title],
  );
  const handleTrackPress = useTrackListPress(songs, similarSource);
  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const trackIdSet = useMemo(() => new Set(songs?.map((t) => t.id)), [songs]);
  const isPlayingFromList = !!(playingTrack && trackIdSet.has(playingTrack.id));
  const hasPlayableTracks = useHasPlayableTracks(songs);
  const shuffle = useQueue((store) => store.shuffle);
  const setShuffle = useQueue((store) => store.setShuffle);

  const handlePlayPress = () => {
    if (isPlayingFromList) {
      togglePlayPause();
      return;
    }
    if (!songs || songs.length === 0) return;
    playTracks(songs.map(childToTrack), 0, {
      shuffleFromRandom: true,
      source: similarSource,
    });
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
        data={isLoading ? loadingData(6) : songs || []}
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
              <HStack className="items-center gap-x-4 mb-4">
                <Text className="text-primary-100" numberOfLines={1}>
                  {t("app.shared.songCount", { count: songs?.length || 0 })}
                </Text>
              </HStack>
              <HStack className="items-center justify-end">
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
      />
    </Box>
  );
}
