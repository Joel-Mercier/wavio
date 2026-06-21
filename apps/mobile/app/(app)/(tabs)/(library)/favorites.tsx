import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import ArrowDown from "lucide-react-native/dist/esm/icons/arrow-down.mjs";
import ArrowDownUp from "lucide-react-native/dist/esm/icons/arrow-down-up.mjs";
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
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import PlayPauseButton from "@/components/PlayPauseButton";
import ShuffleToggle from "@/components/ShuffleToggle";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useStarred2 } from "@/hooks/backend/useLists";
import { useOfflineModeEnabled } from "@/hooks/offline";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import useApp from "@/stores/app";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import useQueue from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import { childToTrack } from "@/utils/childToTrack";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;
const AnimatedBox = Animated.createAnimatedComponent(Box);

const SKELETON_DATA = loadingData(16);
const EMPTY_DATA: Child[] = [];

export default function FavoritesScreen() {
  const [blue500, white, black, emerald500] = Uniwind.getCSSVariable([
    "--color-blue-500",
    "--color-white",
    "--color-black",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const bottomSheetSortModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange: handleSortSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetSortModalRef);
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

  const handleSortPress = (
    type:
      | "addedAtAsc"
      | "addedAtDesc"
      | "alphabeticalAsc"
      | "alphabeticalDesc"
      | "artistAsc"
      | "artistDesc"
      | "albumAsc"
      | "albumDesc",
  ) => {
    bottomSheetSortModalRef.current?.dismiss();
    setFavoritesSort(type);
  };

  const data = useMemo(() => {
    if (!starredData?.starred2?.song) {
      return null;
    }
    const newData = [...starredData.starred2.song];

    if (sort === "addedAtAsc") {
      return newData;
    }
    if (sort === "addedAtDesc") {
      return newData.reverse();
    }
    if (sort === "alphabeticalAsc") {
      return newData.sort((a, b) => {
        return (a?.sortName || a.title).localeCompare(b?.sortName || b.title);
      });
    }
    if (sort === "alphabeticalDesc") {
      return newData.sort((a, b) => {
        return (b?.sortName || b.title).localeCompare(a?.sortName || a.title);
      });
    }
    const byTitle = (a: Child, b: Child) =>
      (a?.sortName || a.title).localeCompare(b?.sortName || b.title);
    if (sort === "artistAsc") {
      return newData.sort((a, b) => {
        const artistCmp = (a.artist || "").localeCompare(b.artist || "");
        if (artistCmp !== 0) return artistCmp;
        const albumCmp = (a.album || "").localeCompare(b.album || "");
        if (albumCmp !== 0) return albumCmp;
        return (a.track ?? 0) - (b.track ?? 0) || byTitle(a, b);
      });
    }
    if (sort === "artistDesc") {
      return newData.sort((a, b) => {
        const artistCmp = (b.artist || "").localeCompare(a.artist || "");
        if (artistCmp !== 0) return artistCmp;
        const albumCmp = (a.album || "").localeCompare(b.album || "");
        if (albumCmp !== 0) return albumCmp;
        return (a.track ?? 0) - (b.track ?? 0) || byTitle(a, b);
      });
    }
    if (sort === "albumAsc") {
      return newData.sort((a, b) => {
        const albumCmp = (a.album || "").localeCompare(b.album || "");
        if (albumCmp !== 0) return albumCmp;
        return (a.track ?? 0) - (b.track ?? 0) || byTitle(a, b);
      });
    }
    if (sort === "albumDesc") {
      return newData.sort((a, b) => {
        const albumCmp = (b.album || "").localeCompare(a.album || "");
        if (albumCmp !== 0) return albumCmp;
        return (a.track ?? 0) - (b.track ?? 0) || byTitle(a, b);
      });
    }
  }, [starredData, sort]);

  const trackIdSet = useMemo(() => new Set(data?.map((t) => t.id)), [data]);
  const isPlayingFromList = !!(playingTrack && trackIdSet.has(playingTrack.id));
  const handlePlayPress = () => {
    if (isPlayingFromList) {
      togglePlayPause();
      return;
    }
    if (!data || data.length === 0) return;
    playTracks(data.map(childToTrack), 0, { shuffleFromRandom: true });
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
  const handleTrackPress = useTrackListPress(data);
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
        <LinearGradient colors={[blue500, "#000"]} locations={[0, 0.7]}>
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
              className="text-white font-bold text-center truncate flex-1"
              size="lg"
            >
              {t("app.favorites.title")}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </AnimatedBox>
      <AnimatedFlashList
        onScroll={scrollHandler}
        data={!starredData ? SKELETON_DATA : data || EMPTY_DATA}
        keyExtractor={keyExtractor}
        renderItem={renderRow}
        ListHeaderComponent={
          <>
            <LinearGradient
              colors={[blue500, "#000000"]}
              className="h-48"
              style={{ height: 192 }}
            >
              <Box
                className="bg-black/25 flex-1"
                style={{ paddingTop: insets.top }}
              >
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
            </LinearGradient>
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
                    {sort.endsWith("Asc") && (
                      <ArrowUp size={16} color={white} />
                    )}
                    {sort.endsWith("Desc") && (
                      <ArrowDown size={16} color={white} />
                    )}
                    {!sort.endsWith("Asc") && !sort.endsWith("Desc") && (
                      <ArrowDownUp size={16} color={white} />
                    )}
                    <Text className="text-white font-bold">
                      {sort.startsWith("addedAt")
                        ? t("app.library.recentSort")
                        : sort.startsWith("artist")
                          ? t("app.library.artistSort")
                          : sort.startsWith("album")
                            ? t("app.library.albumSort")
                            : t("app.library.alphabeticalSort")}
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
          paddingBottom:
            insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
        }}
        showsVerticalScrollIndicator={false}
      />
      <BottomSheetModal
        ref={bottomSheetSortModalRef}
        onChange={handleSortSheetPositionChange}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView
          style={{
            flex: 1,
            alignItems: "center",
          }}
        >
          <Box className="p-6 w-full mb-12">
            <VStack className="mt-6 gap-y-8">
              <FadeOutScaleDown
                onPress={() =>
                  handleSortPress(
                    sort === "addedAtAsc" ? "addedAtDesc" : "addedAtAsc",
                  )
                }
              >
                <HStack className="items-center justify-between">
                  <VStack className="ml-4">
                    <Text className="text-lg text-gray-200">
                      {t("app.library.recentSort")}
                    </Text>
                  </VStack>
                  {sort === "addedAtAsc" && (
                    <ArrowUp size={24} color={emerald500} />
                  )}
                  {sort === "addedAtDesc" && (
                    <ArrowDown size={24} color={emerald500} />
                  )}
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() =>
                  handleSortPress(
                    sort === "alphabeticalAsc"
                      ? "alphabeticalDesc"
                      : "alphabeticalAsc",
                  )
                }
              >
                <HStack className="items-center justify-between">
                  <VStack className="ml-4">
                    <Text className="text-lg text-gray-200">
                      {t("app.library.alphabeticalSort")}
                    </Text>
                  </VStack>
                  {sort === "alphabeticalAsc" && (
                    <ArrowUp size={24} color={emerald500} />
                  )}
                  {sort === "alphabeticalDesc" && (
                    <ArrowDown size={24} color={emerald500} />
                  )}
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() =>
                  handleSortPress(
                    sort === "artistAsc" ? "artistDesc" : "artistAsc",
                  )
                }
              >
                <HStack className="items-center justify-between">
                  <VStack className="ml-4">
                    <Text className="text-lg text-gray-200">
                      {t("app.library.artistSort")}
                    </Text>
                  </VStack>
                  {sort === "artistAsc" && (
                    <ArrowUp size={24} color={emerald500} />
                  )}
                  {sort === "artistDesc" && (
                    <ArrowDown size={24} color={emerald500} />
                  )}
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() =>
                  handleSortPress(
                    sort === "albumAsc" ? "albumDesc" : "albumAsc",
                  )
                }
              >
                <HStack className="items-center justify-between">
                  <VStack className="ml-4">
                    <Text className="text-lg text-gray-200">
                      {t("app.library.albumSort")}
                    </Text>
                  </VStack>
                  {sort === "albumAsc" && (
                    <ArrowUp size={24} color={emerald500} />
                  )}
                  {sort === "albumDesc" && (
                    <ArrowDown size={24} color={emerald500} />
                  )}
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
    </Box>
  );
}
