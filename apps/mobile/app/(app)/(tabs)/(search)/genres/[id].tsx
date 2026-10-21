import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import Disc3 from "lucide-react-native/icons/disc-3";
import EllipsisVertical from "lucide-react-native/icons/ellipsis-vertical";
import LayoutGrid from "lucide-react-native/icons/layout-grid";
import List from "lucide-react-native/icons/list";
import Tag from "lucide-react-native/icons/tag";
import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useWindowDimensions } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import AlbumListItem from "@/components/albums/AlbumListItem";
import AlbumListItemSkeleton from "@/components/albums/AlbumListItemSkeleton";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ScreenHeaderGradient from "@/components/ScreenHeaderGradient";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useInfiniteAlbumList2 } from "@/hooks/backend/useLists";
import { useAlbumScreenLayout } from "@/hooks/useAlbumScreenLayout";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { gridColumnCount } from "@/utils/grid";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";

const AnimatedBox = Animated.createAnimatedComponent(Box);

export default function GenreScreen() {
  const { t } = useTranslation();
  const [white, gray200] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-200",
  ]) as string[];
  const router = useRouter();
  const capabilities = useCapabilities();
  const isOnline = useIsOnline();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const { layout, toggle } = useAlbumScreenLayout("genre-albums");
  const gridColumns =
    layout === "grid"
      ? gridColumnCount(width, {
          minItemWidth: 160,
          minColumns: 3,
          maxColumns: 5,
        })
      : 1;
  const musicFolderId = useCurrentMusicFolderId();
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteAlbumList2({
    type: "byGenre",
    genre: id,
    size: 12,
    musicFolderId,
  });
  const albums = useMemo(
    () => data?.pages.flatMap((page) => page.albumList2?.album ?? []) ?? [],
    [data],
  );
  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);
  const handleCreateMixPress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.push({
      pathname: "/mix",
      params: { kind: "genre", id },
    });
  };
  const optionsButton = capabilities.songLists ? (
    <FadeOutScaleDown onPress={handlePresentModalPress}>
      <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
        <EllipsisVertical size={20} color={white} />
      </Box>
    </FadeOutScaleDown>
  ) : null;
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
              {id}
            </Heading>
            <HStack className="items-center gap-x-3">
              <FadeOutScaleDown testID="album-layout-toggle" onPress={toggle}>
                <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                  {layout === "list" ? (
                    <LayoutGrid size={20} color={white} />
                  ) : (
                    <List size={20} color={white} />
                  )}
                </Box>
              </FadeOutScaleDown>
              {optionsButton}
            </HStack>
          </HStack>
        </ScreenHeaderGradient>
      </AnimatedBox>
      <AnimatedLegendList
        recycleItems
        key={`genre-albums-${layout}-${gridColumns}`}
        onScroll={scrollHandler}
        data={isLoading ? loadingData(12) : albums}
        numColumns={gridColumns}
        extraData={layout}
        renderItem={({ item, index }: { item: AlbumID3; index: number }) =>
          isLoading ? (
            <AlbumListItemSkeleton
              index={index}
              layout={layout === "grid" ? "grid" : "vertical"}
            />
          ) : (
            <AlbumListItem
              album={item}
              index={index}
              layout={layout === "grid" ? "grid" : "vertical"}
            />
          )
        }
        ListHeaderComponent={
          <ScreenHeaderGradient height={192}>
            <Box className="flex-1" style={{ paddingTop: insets.top }}>
              <VStack className="mt-6 px-6 items-start justify-between h-full -mb-12">
                <HStack className="items-center justify-between w-full">
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
                  <HStack className="items-center gap-x-3">
                    <FadeOutScaleDown
                      testID="album-layout-toggle"
                      onPress={toggle}
                    >
                      <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                        {layout === "list" ? (
                          <LayoutGrid size={20} color={white} />
                        ) : (
                          <List size={20} color={white} />
                        )}
                      </Box>
                    </FadeOutScaleDown>
                    {optionsButton}
                  </HStack>
                </HStack>
                <Heading
                  numberOfLines={2}
                  className="text-white mb-12"
                  size="xl"
                >
                  {id}
                </Heading>
              </VStack>
              {error && <ErrorDisplay error={error} />}
            </Box>
          </ScreenHeaderGradient>
        }
        ListEmptyComponent={<EmptyDisplay />}
        // The hero header is full-bleed; cancel the grid container padding on it
        // with a matching negative margin so only the album cells get inset.
        ListHeaderComponentStyle={
          layout === "grid" ? { marginHorizontal: -16 } : undefined
        }
        contentContainerStyle={{
          paddingBottom: screenBottomPadding,
          paddingHorizontal: layout === "grid" ? 16 : 0,
        }}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
      />
      <CenteredBottomSheetModal
        ref={bottomSheetModalRef}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
      >
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ alignItems: "center" }}
        >
          <Box className="p-6 w-full mb-12">
            <HStack className="items-center">
              <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                <Tag size={24} color={white} />
              </Box>
              <VStack className="ml-4 flex-1">
                <Heading
                  className="text-white font-normal"
                  size="lg"
                  numberOfLines={1}
                >
                  {id}
                </Heading>
              </VStack>
            </HStack>
            <VStack className="mt-6 gap-y-8">
              <FadeOutScaleDown
                onPress={handleCreateMixPress}
                disabled={!isOnline}
              >
                <HStack className="items-center">
                  <Disc3 size={24} color={gray200} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.mixes.createGenreMix")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
    </Box>
  );
}
