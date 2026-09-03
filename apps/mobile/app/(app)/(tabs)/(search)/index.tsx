import type { BottomSheetModal } from "@gorhom/bottom-sheet";
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
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SortOptionsSheet, {
  useSortFieldLabel,
} from "@/components/SortOptionsSheet";
import GenreListItem from "@/components/search/GenreListItem";
import GenreListItemSkeleton from "@/components/search/GenreListItemSkeleton";
import TabHeaderGradient, {
  TabHeaderGradientBackdrop,
} from "@/components/TabHeaderGradient";
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { useGenres } from "@/hooks/backend/useBrowsing";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { Genre } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import useAuth from "@/stores/auth";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import {
  GENRE_SORT_FIELDS,
  GENRE_SORT_SPECS,
  genreSortEnabled,
} from "@/utils/genreSort";
import { gridCellMarginClass, gridColumnCount } from "@/utils/grid";
import { loadingData } from "@/utils/loadingData";
import {
  availableSortFields,
  effectiveSort,
  parseSortType,
  sortItems,
} from "@/utils/sort";
import { cn } from "@/utils/tailwind";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;
const AnimatedBox = Animated.createAnimatedComponent(Box);

// Space left above the search bar once it's pinned at the top. The header stops
// collapsing this many px short of the title's full height (the title has faded
// out by then, so it reads as plain padding above the pinned search bar).
const PINNED_TOP_GAP = 16;

export default function SearchScreen() {
  const [gray500, white] = Uniwind.getCSSVariable([
    "--color-gray-500",
    "--color-white",
  ]) as string[];
  const { t } = useTranslation();
  const username = useAuth((store) => store.username);
  const setShowDrawer = useApp((store) => store.setShowDrawer);
  const isWideLayout = useApp((store) => store.isWideLayout);
  const sort = useApp((store) => store.genresSort);
  const setSort = useApp((store) => store.setGenresSort);
  const capabilities = useCapabilities();
  const sortFieldLabel = useSortFieldLabel();
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
  const sortFields = useMemo(
    () =>
      availableSortFields(
        genres,
        GENRE_SORT_SPECS,
        GENRE_SORT_FIELDS,
        genreSortEnabled(capabilities),
      ),
    [genres, capabilities],
  );
  // Falls back to alphabetical when a persisted count sort can't apply (Jellyfin
  // and library-scoped Navidrome expose no counts) without dropping the choice.
  const activeSort = effectiveSort(sort, sortFields, "alphabeticalAsc");

  const sortedGenres = useMemo(
    () => sortItems(genres, activeSort, GENRE_SORT_SPECS),
    [genres, activeSort],
  );

  const handleSearchPress = () => {
    router.navigate("/(app)/(tabs)/(search)/recent-searches");
  };

  const handlePresentSortModalPress = useCallback(() => {
    bottomSheetModalSortRef.current?.present();
  }, []);

  // Swapping the sort reorders the list; reset to the top so the new ordering
  // starts in view instead of keeping the previous offset.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activeSort]);

  return (
    <Box className="h-full">
      <TabHeaderGradient />
      <AnimatedBox
        onLayout={handleHeaderLayout}
        className="absolute top-0 left-0 right-0 z-10"
        style={[{ paddingTop: insets.top }, headerStyle]}
      >
        <TabHeaderGradientBackdrop offsetY={collapsed} />
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
              <Text className="text-white font-bold">
                {sortFieldLabel(parseSortType(activeSort).field)}
              </Text>
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
      <SortOptionsSheet
        ref={bottomSheetModalSortRef}
        fields={sortFields}
        sort={activeSort}
        onSelect={setSort}
      />
    </Box>
  );
}
