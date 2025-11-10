import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useStarred2 } from "@/hooks/openSubsonic/useLists";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { useOfflineDownloads } from "@/hooks/useOfflineDownloads";
import type { Child } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import useRecentPlays from "@/stores/recentPlays";
import { loadingData } from "@/utils/loadingData";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowLeft,
  ArrowUp,
  Play,
  Search,
  Shuffle,
} from "lucide-react-native";
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

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);
const AnimatedBox = Animated.createAnimatedComponent(Box);

export default function FavoritesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const bottomSheetSortModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange: handleSortSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetSortModalRef);
  const { data: starredData, isLoading, error } = useStarred2({});
  const addRecentPlay = useRecentPlays((store) => store.addRecentPlay);
  const { offlineModeEnabled } = useOfflineDownloads();
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
  const handleTrackPressCallback = () => {
    addRecentPlay({ id: "favorites", title: "Favorites", type: "favorites" });
  };

  const handlePresentSortModalPress = useCallback(() => {
    bottomSheetSortModalRef.current?.present();
  }, []);

  const handleSortPress = (
    type: "addedAtAsc" | "addedAtDesc" | "alphabeticalAsc" | "alphabeticalDesc",
  ) => {
    bottomSheetSortModalRef.current?.dismiss();
    setFavoritesSort(type);
  };

  const data = useMemo(() => {
    if (!starredData || !starredData?.starred2 || !starredData?.starred2.song) {
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
  }, [starredData, sort]);

  return (
    <Box className="h-full">
      <AnimatedBox
        className="w-full z-10 absolute top-0 left-0 right-0"
        style={[headerStyle]}
      >
        <LinearGradient
          colors={["#000", themeConfig.theme.colors.blue[500]]}
          locations={[0, 0.7]}
        >
          <HStack
            className="items-center justify-between pb-4 px-6 bg-black/25"
            style={{ paddingTop: insets.top + 16 }}
          >
            <FadeOutScaleDown onPress={() => router.back()}>
              <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                <ArrowLeft size={24} color={themeConfig.theme.colors.white} />
              </Box>
            </FadeOutScaleDown>
            <Heading
              numberOfLines={1}
              className="text-white font-bold"
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
        data={data || loadingData(16)}
        renderItem={({ item, index }: { item: Child; index: number }) =>
          isLoading ? (
            <TrackListItemSkeleton index={index} className="px-6" />
          ) : (
            <TrackListItem
              track={item}
              index={index}
              className="px-6"
              onPlayCallback={handleTrackPressCallback}
            />
          )
        }
        ListHeaderComponent={() => (
          <>
            <LinearGradient
              colors={[themeConfig.theme.colors.blue[500], "#000000"]}
              className="h-48"
              style={{ height: 192 }}
            >
              <Box
                className="bg-black/25 flex-1"
                style={{ paddingTop: insets.top }}
              >
                <VStack className="mt-6 px-6 items-start justify-between h-full -mb-12">
                  <Pressable onPress={() => router.back()}>
                    <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                      <ArrowLeft
                        size={24}
                        color={themeConfig.theme.colors.white}
                      />
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
                    <ArrowDown
                      size={20}
                      color={themeConfig.theme.colors.black}
                    />
                  </Box>
                )}
              </HStack>
              <HStack className="items-center justify-between">
                <FadeOutScaleDown onPress={handlePresentSortModalPress}>
                  <HStack className="items-center gap-x-2">
                    {sort.endsWith("Asc") && (
                      <ArrowUp
                        size={16}
                        color={themeConfig.theme.colors.white}
                      />
                    )}
                    {sort.endsWith("Desc") && (
                      <ArrowDown
                        size={16}
                        color={themeConfig.theme.colors.white}
                      />
                    )}
                    {!sort.endsWith("Asc") && !sort.endsWith("Desc") && (
                      <ArrowDownUp
                        size={16}
                        color={themeConfig.theme.colors.white}
                      />
                    )}
                    <Text className="text-white font-bold">
                      {sort.startsWith("addedAt")
                        ? t("app.library.recentSort")
                        : t("app.library.alphabeticalSort")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <HStack className="items-center gap-x-4">
                  <Pressable>
                    <Shuffle color={themeConfig.theme.colors.white} />
                  </Pressable>
                  <Pressable>
                    <Box className="w-12 h-12 rounded-full bg-emerald-500 items-center justify-center">
                      <Play
                        color={themeConfig.theme.colors.white}
                        fill={themeConfig.theme.colors.white}
                      />
                    </Box>
                  </Pressable>
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
        )}
        ListEmptyComponent={() => <EmptyDisplay />}
        contentContainerStyle={{
          paddingBottom: bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
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
                    <ArrowUp
                      size={24}
                      color={themeConfig.theme.colors.emerald[500]}
                    />
                  )}
                  {sort === "addedAtDesc" && (
                    <ArrowDown
                      size={24}
                      color={themeConfig.theme.colors.emerald[500]}
                    />
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
                    <ArrowUp
                      size={24}
                      color={themeConfig.theme.colors.emerald[500]}
                    />
                  )}
                  {sort === "alphabeticalDesc" && (
                    <ArrowDown
                      size={24}
                      color={themeConfig.theme.colors.emerald[500]}
                    />
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
