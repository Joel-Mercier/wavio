import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import ArrowDown from "lucide-react-native/dist/esm/icons/arrow-down.mjs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import ArrowUp from "lucide-react-native/dist/esm/icons/arrow-up.mjs";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import { useCallback, useMemo, useRef } from "react";
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
import ScreenHeaderGradient from "@/components/ScreenHeaderGradient";
import ShuffleToggle from "@/components/ShuffleToggle";
import SortOptionsSheet, {
  useSortFieldLabel,
} from "@/components/SortOptionsSheet";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useStarred2 } from "@/hooks/backend/useLists";
import { useHasPlayableTracks, useOfflineModeEnabled } from "@/hooks/offline";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import { useTrackSort } from "@/hooks/useTrackSort";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import useApp from "@/stores/app";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import useQueue, { type QueueSource } from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import { childToTrack } from "@/utils/childToTrack";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import { sortItems } from "@/utils/sort";
import { TRACK_SORT_SPECS } from "@/utils/trackSort";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;
const AnimatedBox = Animated.createAnimatedComponent(Box);

const SKELETON_DATA = loadingData(16);
const EMPTY_DATA: Child[] = [];

export default function FavoritesScreen() {
  const [white, black] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-black",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const bottomSheetSortModalRef = useRef<BottomSheetModal>(null);
  const musicFolderId = useCurrentMusicFolderId();
  const {
    data: starredData,
    isLoading,
    error,
  } = useStarred2({ musicFolderId });
  const addRecentPlay = useRecentPlays((store) => store.addRecentPlay);
  const offlineModeEnabled = useOfflineModeEnabled();
  const sort = useApp((store) => store.favoritesSort);
  const setFavoritesSort = useApp((store) => store.setFavoritesSort);
  const offsetY = useSharedValue(0);
  const headerStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        offsetY.value,
        [0, 100],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    };
  });
  const scrollHandler = useAnimatedScrollHandler((event) => {
    offsetY.value = event.contentOffset.y;
  });
  const handleTrackPressCallback = useCallback(() => {
    addRecentPlay({ id: "favorites", title: "Favorites", type: "favorites" });
  }, [addRecentPlay]);

  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();

  const handlePresentSortModalPress = useCallback(() => {
    bottomSheetSortModalRef.current?.present();
  }, []);

  const songs = starredData?.starred2?.song;
  // Renders as the starred order when the saved field has no data on this
  // backend, without overwriting the preference.
  const { sortFields, activeSort, activeSortField } = useTrackSort(songs, sort);
  const sortFieldLabel = useSortFieldLabel();

  const data = useMemo(
    () => (songs ? sortItems(songs, activeSort, TRACK_SORT_SPECS) : null),
    [songs, activeSort],
  );

  const trackIdSet = useMemo(() => new Set(data?.map((t) => t.id)), [data]);
  const isPlayingFromList = !!(playingTrack && trackIdSet.has(playingTrack.id));
  const favoritesSource = useMemo<QueueSource>(
    () => ({ type: "likedSongs", name: t("app.favorites.title") }),
    [t],
  );
  const hasPlayableTracks = useHasPlayableTracks(data);
  const handlePlayPress = () => {
    if (isPlayingFromList) {
      togglePlayPause();
      return;
    }
    if (!data || data.length === 0) return;
    playTracks(data.map(childToTrack), 0, {
      shuffleFromRandom: true,
      source: favoritesSource,
    });
    addRecentPlay({ id: "favorites", title: "Favorites", type: "favorites" });
  };

  const shuffle = useQueue((store) => store.shuffle);
  const setShuffle = useQueue((store) => store.setShuffle);
  const handleShufflePress = () => {
    setShuffle(!shuffle);
  };

  const keyExtractor = useCallback(
    (item: Child, index: number) => item.id ?? String(index),
    [],
  );
  const isLoadingRows = !starredData;
  const handleTrackPress = useTrackListPress(data, favoritesSource);
  const renderRow = useCallback(
    ({ item, index }: { item: Child; index: number }) =>
      isLoadingRows ? (
        <TrackListItemSkeleton index={index} className="px-6" />
      ) : (
        <TrackListItem
          track={item}
          index={index}
          onPress={handleTrackPress}
          className="px-6"
          onPlayCallback={handleTrackPressCallback}
        />
      ),
    [isLoadingRows, handleTrackPress, handleTrackPressCallback],
  );

  return (
    <Box className="h-full">
      <AnimatedBox
        className="w-full z-10 absolute top-0 left-0 right-0"
        style={[headerStyle]}
      >
        <ScreenHeaderGradient opaque>
          <HStack
            className="items-center justify-between pb-4 px-6"
            style={{ paddingTop: insets.top + 16 }}
          >
            <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
              <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                <ArrowLeft size={24} color={white} />
              </Box>
            </FadeOutScaleDown>
            <Heading
              numberOfLines={1}
              className="text-white font-bold text-center truncate flex-1"
              size="lg"
            >
              {t("app.favorites.title")}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </ScreenHeaderGradient>
      </AnimatedBox>
      <AnimatedFlashList
        onScroll={scrollHandler}
        data={!starredData ? SKELETON_DATA : data || EMPTY_DATA}
        keyExtractor={keyExtractor}
        renderItem={renderRow}
        ListHeaderComponent={
          <>
            <ScreenHeaderGradient height={192}>
              <Box className="flex-1" style={{ paddingTop: insets.top }}>
                <VStack className="mt-6 px-6 items-start justify-between h-full -mb-12">
                  <Pressable onPress={() => goBackOrHome(router)}>
                    <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                      <ArrowLeft size={24} color={white} />
                    </Box>
                  </Pressable>
                  <Heading
                    numberOfLines={2}
                    className="text-white mb-12 font-bold"
                    size="xl"
                  >
                    {t("app.favorites.favorite_tracks")}
                  </Heading>
                </VStack>
              </Box>
            </ScreenHeaderGradient>
            <VStack className="px-6">
              <HStack className="items-center gap-x-4 mb-4">
                <Text className="text-primary-100" numberOfLines={1}>
                  {t("app.shared.songCount", {
                    count: starredData?.starred2.song?.length || 0,
                  })}
                </Text>
                {offlineModeEnabled && (
                  <Box className="size-6 rounded-full bg-emerald-500 items-center justify-center">
                    <ArrowDown size={20} color={black} />
                  </Box>
                )}
              </HStack>
              <HStack className="items-center justify-between">
                <FadeOutScaleDown onPress={handlePresentSortModalPress}>
                  <HStack className="items-center gap-x-2">
                    {activeSort.endsWith("Desc") ? (
                      <ArrowDown size={16} color={white} />
                    ) : (
                      <ArrowUp size={16} color={white} />
                    )}
                    <Text className="text-white font-bold">
                      {sortFieldLabel(activeSortField)}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
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
              <FadeOutScaleDown href={"/favorites/search"} className="my-4">
                <HStack className="px-4 gap-x-4 h-10 rounded-lg bg-primary-600 items-center">
                  <Search
                    size={20}
                    color={"rgb(128, 128, 128)"}
                    className="text-primary-100"
                  />
                  <Text className="text-primary-100 text-sm">
                    {t("app.favorites.searchPlaceholder")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              {error && <ErrorDisplay error={error} />}
            </VStack>
          </>
        }
        ListEmptyComponent={<EmptyDisplay />}
        contentContainerStyle={{
          paddingBottom: screenBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
      />
      <SortOptionsSheet
        ref={bottomSheetSortModalRef}
        fields={sortFields}
        sort={activeSort}
        onSelect={setFavoritesSort}
      />
    </Box>
  );
}
