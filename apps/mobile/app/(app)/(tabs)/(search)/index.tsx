import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import ArrowDown from "lucide-react-native/dist/esm/icons/arrow-down.mjs";
import ArrowUp from "lucide-react-native/dist/esm/icons/arrow-up.mjs";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type LayoutChangeEvent, useWindowDimensions } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import GenreListItem from "@/components/search/GenreListItem";
import GenreListItemSkeleton from "@/components/search/GenreListItemSkeleton";
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useGenres } from "@/hooks/backend/useBrowsing";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { Genre } from "@/services/openSubsonic/types";
import useApp, { type GenresSort } from "@/stores/app";
import useAuth from "@/stores/auth";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { gridCellMarginClass, gridColumnCount } from "@/utils/grid";
import { loadingData } from "@/utils/loadingData";
import { cn } from "@/utils/tailwind";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;
const AnimatedBox = Animated.createAnimatedComponent(Box);

const isAlphabeticalSort = (sort: GenresSort) =>
  sort === "alphabeticalAsc" || sort === "alphabeticalDesc";

// Space left above the search bar once it's pinned at the top. The header stops
// collapsing this many px short of the title's full height (the title has faded
// out by then, so it reads as plain padding above the pinned search bar).
const PINNED_TOP_GAP = 16;

export default function SearchScreen() {
  const [gray500, white, emerald500] = Uniwind.getCSSVariable([
    "--color-gray-500",
    "--color-white",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const username = useAuth((store) => store.username);
  const serverType = useAuth((store) => store.serverType);
  const setShowDrawer = useApp((store) => store.setShowDrawer);
  const isWideLayout = useApp((store) => store.isWideLayout);
  const sort = useApp((store) => store.genresSort);
  const setSort = useApp((store) => store.setGenresSort);
  const router = useRouter();
  const screenBottomPadding = useScreenBottomPadding();
  const musicFolderId = useCurrentMusicFolderId();
  const { data, isLoading, error } = useGenres({ musicFolderId });
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const numColumns = gridColumnCount(width, {
    minItemWidth: 220,
    minColumns: 2,
    maxColumns: 4,
  });

  const bottomSheetModalSortRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange: handleSheetPositionChangeSort } =
    useBottomSheetBackHandler(bottomSheetModalSortRef);
  const listRef = useRef<FlashListRef<Genre>>(null);

  const titleHeight = useSharedValue(0);
  // Direction-aware collapse: track how far the title is collapsed (0..max) by
  // accumulating scroll deltas, so scrolling up anywhere reveals it again
  // instead of only when the list returns to the top.
  const collapsed = useSharedValue(0);
  const lastOffset = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    const y = event.contentOffset.y;
    const max = Math.max(titleHeight.value - PINNED_TOP_GAP, 0);
    const diff = y - lastOffset.value;
    lastOffset.value = y;
    collapsed.value = Math.min(Math.max(collapsed.value + diff, 0), max);
  });
  const headerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -collapsed.value }],
  }));
  // Fade the avatar/title out as it collapses so it doesn't stay visible behind
  // the status bar in the edge-to-edge layout.
  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      collapsed.value,
      [0, Math.max(titleHeight.value - PINNED_TOP_GAP, 1)],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));
  const [headerHeight, setHeaderHeight] = useState(0);
  const handleHeaderLayout = (event: LayoutChangeEvent) => {
    setHeaderHeight(event.nativeEvent.layout.height);
  };
  const handleTitleLayout = (event: LayoutChangeEvent) => {
    titleHeight.value = event.nativeEvent.layout.height;
  };

  const genres = useMemo(() => data?.genres.genre ?? [], [data]);
  const countsAvailable =
    serverType !== "jellyfin" && genres.some((g) => g.songCount != null);
  // Fall back to alphabetical when a persisted count sort can't apply on the
  // active backend (Jellyfin / library-scoped Navidrome expose no counts).
  const activeSort: GenresSort =
    !countsAvailable && !isAlphabeticalSort(sort) ? "alphabeticalAsc" : sort;

  const sortedGenres = useMemo(() => {
    const sorted = [...genres];
    sorted.sort((a, b) => {
      switch (activeSort) {
        case "alphabeticalAsc":
          return a.value.localeCompare(b.value);
        case "alphabeticalDesc":
          return b.value.localeCompare(a.value);
        case "songCountAsc":
          return (a.songCount ?? 0) - (b.songCount ?? 0);
        case "songCountDesc":
          return (b.songCount ?? 0) - (a.songCount ?? 0);
        case "albumCountAsc":
          return (a.albumCount ?? 0) - (b.albumCount ?? 0);
        case "albumCountDesc":
          return (b.albumCount ?? 0) - (a.albumCount ?? 0);
        default:
          return 0;
      }
    });
    return sorted;
  }, [genres, activeSort]);

  const handleSearchPress = () => {
    router.navigate("/(app)/(tabs)/(search)/recent-searches");
  };

  const handlePresentSortModalPress = useCallback(() => {
    bottomSheetModalSortRef.current?.present();
  }, []);

  const handleSortPress = (type: GenresSort) => {
    bottomSheetModalSortRef.current?.dismiss();
    setSort(type);
  };

  // Swapping the sort reorders the list; reset to the top so the new ordering
  // starts in view instead of keeping the previous offset.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activeSort]);

  const sortLabel = isAlphabeticalSort(activeSort)
    ? t("app.search.sort.alphabetical")
    : activeSort.startsWith("songCount")
      ? t("app.search.sort.trackCount")
      : t("app.search.sort.albumCount");

  return (
    <Box className="h-full">
      <AnimatedBox
        onLayout={handleHeaderLayout}
        className="absolute top-0 left-0 right-0 z-10 bg-background"
        style={[{ paddingTop: insets.top }, headerStyle]}
      >
        {/* Vertical spacing lives on this wrapper as padding (not margin) so its
            onLayout height is the exact distance the header collapses, letting
            the search bar pin at the top. The title fades as it collapses. */}
        <AnimatedBox
          onLayout={handleTitleLayout}
          style={titleStyle}
          className={cn("pb-6", { "pt-6": !isWideLayout })}
        >
          <HStack className="px-6 gap-x-4 items-center">
            <FadeOutScaleDown
              testID="open-drawer-button"
              onPress={() => setShowDrawer(true)}
            >
              <Avatar className="border-emerald-500 border-2 w-10 h-10">
                <AvatarFallbackText className="font-body ">
                  {username}
                </AvatarFallbackText>
              </Avatar>
            </FadeOutScaleDown>
            <Heading className="text-white" size="2xl">
              {t("app.search.title")}
            </Heading>
          </HStack>
        </AnimatedBox>
        <FadeOutScaleDown className="mx-6" onPress={handleSearchPress}>
          <HStack className="bg-white rounded-md py-3 px-3">
            <Search size={22} color={gray500} />
            <Text className="text-gray-500 text-xl ml-4">
              {t("app.search.inputPlaceholder")}
            </Text>
          </HStack>
        </FadeOutScaleDown>
        <HStack className="px-6 pt-6 pb-4 items-center justify-between">
          <Heading size="lg" className="text-white">
            {t("app.search.exploreGenres")}
          </Heading>
          <FadeOutScaleDown onPress={handlePresentSortModalPress}>
            <HStack className="items-center gap-x-2">
              {activeSort.endsWith("Asc") ? (
                <ArrowUp size={16} color={white} />
              ) : (
                <ArrowDown size={16} color={white} />
              )}
              <Text className="text-white font-bold">{sortLabel}</Text>
            </HStack>
          </FadeOutScaleDown>
        </HStack>
      </AnimatedBox>
      <AnimatedFlashList
        ref={listRef}
        key={`genres-${numColumns}`}
        onScroll={scrollHandler}
        data={isLoading ? loadingData(16) : sortedGenres}
        renderItem={({ item, index }: { item: Genre; index: number }) => (
          <Box
            className={cn(
              "flex-1 mb-4",
              gridCellMarginClass(index % numColumns, numColumns),
            )}
          >
            {isLoading ? (
              <GenreListItemSkeleton />
            ) : (
              <GenreListItem genre={item} />
            )}
          </Box>
        )}
        numColumns={numColumns}
        ListHeaderComponent={error ? <ErrorDisplay error={error} /> : null}
        ListEmptyComponent={<EmptyDisplay />}
        contentContainerStyle={{
          paddingTop: headerHeight,
          paddingHorizontal: 24,
          paddingBottom: screenBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
      />
      <CenteredBottomSheetModal
        ref={bottomSheetModalSortRef}
        onChange={handleSheetPositionChangeSort}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
      >
        <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
          <Box className="p-6 w-full mb-12">
            <VStack className="mt-6 gap-y-8">
              <FadeOutScaleDown
                onPress={() =>
                  handleSortPress(
                    activeSort === "alphabeticalAsc"
                      ? "alphabeticalDesc"
                      : "alphabeticalAsc",
                  )
                }
              >
                <HStack className="items-center justify-between">
                  <VStack className="ml-4">
                    <Text className="text-lg text-gray-200">
                      {t("app.search.sort.alphabetical")}
                    </Text>
                  </VStack>
                  {activeSort === "alphabeticalAsc" && (
                    <ArrowUp size={24} color={emerald500} />
                  )}
                  {activeSort === "alphabeticalDesc" && (
                    <ArrowDown size={24} color={emerald500} />
                  )}
                </HStack>
              </FadeOutScaleDown>
              {countsAvailable && (
                <FadeOutScaleDown
                  onPress={() =>
                    handleSortPress(
                      activeSort === "songCountAsc"
                        ? "songCountDesc"
                        : "songCountAsc",
                    )
                  }
                >
                  <HStack className="items-center justify-between">
                    <VStack className="ml-4">
                      <Text className="text-lg text-gray-200">
                        {t("app.search.sort.trackCount")}
                      </Text>
                    </VStack>
                    {activeSort === "songCountAsc" && (
                      <ArrowUp size={24} color={emerald500} />
                    )}
                    {activeSort === "songCountDesc" && (
                      <ArrowDown size={24} color={emerald500} />
                    )}
                  </HStack>
                </FadeOutScaleDown>
              )}
              {countsAvailable && (
                <FadeOutScaleDown
                  onPress={() =>
                    handleSortPress(
                      activeSort === "albumCountAsc"
                        ? "albumCountDesc"
                        : "albumCountAsc",
                    )
                  }
                >
                  <HStack className="items-center justify-between">
                    <VStack className="ml-4">
                      <Text className="text-lg text-gray-200">
                        {t("app.search.sort.albumCount")}
                      </Text>
                    </VStack>
                    {activeSort === "albumCountAsc" && (
                      <ArrowUp size={24} color={emerald500} />
                    )}
                    {activeSort === "albumCountDesc" && (
                      <ArrowDown size={24} color={emerald500} />
                    )}
                  </HStack>
                </FadeOutScaleDown>
              )}
            </VStack>
          </Box>
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
    </Box>
  );
}
