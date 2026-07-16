import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import { useMemo, useState } from "react";
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
import { Box } from "@/components/ui/box";
import { useInfiniteAlbumList2 } from "@/hooks/backend/useLists";
import { useIsPlaying } from "@/hooks/player";
import { useAlbumScreenLayout } from "@/hooks/useAlbumScreenLayout";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { getAlbum } from "@/services/backend/browsing";
import type { AlbumListType } from "@/services/openSubsonic/lists";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import useQueue, { type QueueSource } from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";
import { gridColumnCount } from "@/utils/grid";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import AlbumLayoutToggle from "../albums/AlbumLayoutToggle";
import AlbumListItem from "../albums/AlbumListItem";
import AlbumListItemSkeleton from "../albums/AlbumListItemSkeleton";
import EmptyDisplay from "../EmptyDisplay";
import ErrorDisplay from "../ErrorDisplay";
import FadeOutScaleDown from "../FadeOutScaleDown";
import PlayPauseButton from "../PlayPauseButton";
import ShuffleToggle from "../ShuffleToggle";
import { Heading } from "../ui/heading";
import { HStack } from "../ui/hstack";
import { Pressable } from "../ui/pressable";
import { VStack } from "../ui/vstack";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;
const AnimatedBox = Animated.createAnimatedComponent(Box);

export default function HomeSectionDetail() {
  const [emerald500, white] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-white",
  ]) as string[];
  const { t } = useTranslation();
  const screenBottomPadding = useScreenBottomPadding();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { type } = useLocalSearchParams<{ type: AlbumListType }>();
  const { width } = useWindowDimensions();
  const { layout, toggle } = useAlbumScreenLayout(`home-section:${type}`);
  const gridColumns =
    layout === "grid"
      ? gridColumnCount(width, {
          minItemWidth: 160,
          minColumns: 3,
          maxColumns: 5,
        })
      : 1;
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
  } = useInfiniteAlbumList2({
    type,
    size: 12,
    musicFolderId,
  });
  const albums = useMemo(
    () => data?.pages.flatMap((page) => page.albumList2?.album ?? []) ?? [],
    [data],
  );
  const heading = t(`app.home.sections.${type}`);
  const source = useMemo<QueueSource>(
    () => ({ type: "albumList", name: heading, id: type }),
    [heading, type],
  );
  const queueSource = useQueue((store) => store.source);
  const isActiveSource =
    queueSource?.type === "albumList" && queueSource.id === type;
  const isPlaying = useIsPlaying();
  const shuffle = useQueue((store) => store.shuffle);
  const setShuffle = useQueue((store) => store.setShuffle);
  const [preparing, setPreparing] = useState(false);
  const canPlay = !preparing && albums.length > 0;

  const buildTracks = async () => {
    const results = await Promise.all(
      albums.map((album) =>
        queryClient.fetchQuery({
          queryKey: ["album", album.id],
          queryFn: () => getAlbum(album.id),
        }),
      ),
    );
    return results
      .flatMap((result) => result?.album?.song ?? [])
      .map(childToTrack);
  };

  const handlePlayPress = async () => {
    if (isActiveSource) {
      togglePlayPause();
      return;
    }
    if (!canPlay) return;
    setPreparing(true);
    try {
      const tracks = await buildTracks();
      if (tracks.length === 0) return;
      playTracks(tracks, 0, { shuffleFromRandom: true, source });
    } finally {
      setPreparing(false);
    }
  };

  const handleShufflePress = () => {
    setShuffle(!shuffle);
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
        key={`home-section-${layout}-${gridColumns}`}
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
          ) : layout === "grid" ? (
            <AlbumListItem album={item} index={index} layout="grid" />
          ) : (
            <Box className="bg-black">
              <AlbumListItem album={item} index={index} />
            </Box>
          )
        }
        ListHeaderComponent={
          <Box style={{ marginHorizontal: layout === "grid" ? -16 : 0 }}>
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
              <HStack className="items-center justify-between mb-4">
                <AlbumLayoutToggle layout={layout} onPress={toggle} />
                <HStack className="items-center gap-x-4">
                  <ShuffleToggle
                    active={shuffle}
                    onPress={handleShufflePress}
                  />
                  <PlayPauseButton
                    isPlaying={isActiveSource && isPlaying}
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
          </Box>
        }
        ListEmptyComponent={isLoading ? null : <EmptyDisplay />}
        keyExtractor={(item) => item.id}
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
    </Box>
  );
}
