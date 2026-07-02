import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import PlayPauseButton from "@/components/PlayPauseButton";
import ShuffleToggle from "@/components/ShuffleToggle";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { VStack } from "@/components/ui/vstack";
import { useInfiniteMostPlayedSongs } from "@/hooks/backend/useLists";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import { useFloatingPlayerInset } from "@/hooks/useFloatingPlayerInset";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import useQueue, { type QueueSource } from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;
const AnimatedBox = Animated.createAnimatedComponent(Box);

export default function MostPlayedTracksScreen() {
  const [emerald500, white] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-white",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const floatingPlayerInset = useFloatingPlayerInset();
  const musicFolderId = useCurrentMusicFolderId();
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
  } = useInfiniteMostPlayedSongs({ size: 20, musicFolderId });
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

  const handlePlayPress = () => {
    if (isPlayingFromList) {
      togglePlayPause();
      return;
    }
    if (songs.length === 0) return;
    useQueue.getState().setShuffle(false);
    playTracks(songs.map(childToTrack), 0, { source });
  };

  const handleShufflePress = () => {
    if (songs.length === 0) return;
    useQueue.getState().setShuffle(true);
    const startIndex = Math.floor(Math.random() * songs.length);
    playTracks(songs.map(childToTrack), startIndex, { source });
  };

  return (
    <Box className="h-full">
      <AnimatedBox
        className="w-full z-10 absolute top-0 left-0 right-0"
        style={[headerStyle]}
      >
        <LinearGradient colors={["#000", emerald500]} locations={[0, 0.7]}>
          <HStack
            className="items-center justify-between pb-4 px-6 bg-black/25"
            style={{ paddingTop: insets.top + 16 }}
          >
            <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
              <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                <ArrowLeft size={24} color={white} />
              </Box>
            </FadeOutScaleDown>
            <Heading
              numberOfLines={1}
              className="text-white font-bold flex-1 mx-4 text-center"
              size="lg"
            >
              {heading}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </AnimatedBox>
      <AnimatedFlashList
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
            <LinearGradient
              colors={[emerald500, "#000000"]}
              className="h-48"
              style={{ height: 192 }}
            >
              <Box
                className="bg-black/25 flex-1"
                style={{ paddingTop: insets.top }}
              >
                <VStack className="mt-6 px-6 items-start justify-between h-full -mb-12">
                  <Pressable onPress={() => goBackOrHome(router)}>
                    {({ pressed }) => (
                      <Animated.View
                        className="transition duration-100 w-10 h-10 rounded-full bg-black/40 items-center justify-center"
                        style={{
                          transform: [{ scale: pressed ? 0.95 : 1 }],
                          opacity: pressed ? 0.5 : 1,
                        }}
                      >
                        <ArrowLeft size={24} color={white} />
                      </Animated.View>
                    )}
                  </Pressable>
                  <Heading
                    numberOfLines={2}
                    className="text-white mb-12"
                    size="xl"
                  >
                    {heading}
                  </Heading>
                </VStack>
              </Box>
            </LinearGradient>
            <VStack className="px-6">
              <HStack className="items-center justify-end mb-4">
                <HStack className="items-center gap-x-4">
                  <ShuffleToggle active={false} onPress={handleShufflePress} />
                  <PlayPauseButton
                    isPlaying={isPlayingFromList && isPlaying}
                    onPress={handlePlayPress}
                    size={48}
                    iconSize={24}
                    color={white}
                    className="bg-emerald-500"
                  />
                </HStack>
              </HStack>
              {error && <ErrorDisplay error={error} />}
            </VStack>
          </>
        }
        ListEmptyComponent={isLoading ? null : <EmptyDisplay />}
        contentContainerStyle={{
          paddingBottom:
            insets.bottom + bottomTabBarHeight + floatingPlayerInset,
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
