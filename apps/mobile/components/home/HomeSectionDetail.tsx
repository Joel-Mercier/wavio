import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWindowDimensions } from "react-native";
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
import { Box } from "@/components/ui/box";
import {
  useInfiniteAlbumList2,
  useInfiniteLeastPlayedAlbums,
} from "@/hooks/backend/useLists";
import { useIsPlaying } from "@/hooks/player";
import { useAlbumScreenLayout } from "@/hooks/useAlbumScreenLayout";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { getAlbum } from "@/services/backend/browsing";
import type { AlbumListType } from "@/services/openSubsonic/lists";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import { useCurrentMusicFolderIds } from "@/stores/musicFolders";
import useQueue, { type QueueSource } from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";
import { COVER_GRID, gridColumnCount } from "@/utils/grid";
import { loadingData } from "@/utils/loadingData";
import { mapWithConcurrency } from "@/utils/mapWithConcurrency";
import AlbumLayoutToggle from "../albums/AlbumLayoutToggle";
import AlbumListItem from "../albums/AlbumListItem";
import AlbumListItemSkeleton from "../albums/AlbumListItemSkeleton";
import EmptyDisplay from "../EmptyDisplay";
import ErrorDisplay from "../ErrorDisplay";
import PlayPauseButton from "../PlayPauseButton";
import ShuffleToggle from "../ShuffleToggle";
import { HStack } from "../ui/hstack";
import { VStack } from "../ui/vstack";

export default function HomeSectionDetail() {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  const { showErrorToast } = useSettingsToast();
  const screenBottomPadding = useScreenBottomPadding();
  const queryClient = useQueryClient();
  const { type } = useLocalSearchParams<{
    type: AlbumListType | "leastPlayed";
  }>();
  const isLeastPlayed = type === "leastPlayed";
  const { width } = useWindowDimensions();
  const { layout, toggle } = useAlbumScreenLayout(`home-section:${type}`);
  const gridColumns =
    layout === "grid" ? gridColumnCount(width, COVER_GRID) : 1;
  const musicFolderIds = useCurrentMusicFolderIds();
  const offsetY = useSharedValue(0);
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offsetY.value, [0, 50], [0, 1], Extrapolation.CLAMP),
  }));
  const scrollHandler = useAnimatedScrollHandler((event) => {
    offsetY.value = event.contentOffset.y;
  });
  const albumListQuery = useInfiniteAlbumList2(
    {
      type: isLeastPlayed ? "random" : type,
      size: 12,
      musicFolderIds,
    },
    { enabled: !isLeastPlayed },
  );
  const leastPlayedQuery = useInfiniteLeastPlayedAlbums(
    { size: 12, musicFolderIds },
    { enabled: isLeastPlayed },
  );
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = isLeastPlayed ? leastPlayedQuery : albumListQuery;
  // Random pools from an unseeded backend (local, Jellyfin) can overlap.
  const albums = useMemo(() => {
    const seen = new Set<string>();
    return (
      data?.pages
        .flatMap((page) => page.albumList2?.album ?? [])
        .filter((album) => {
          if (seen.has(album.id)) return false;
          seen.add(album.id);
          return true;
        }) ?? []
    );
  }, [data]);
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
    const results = await mapWithConcurrency(albums, 4, (album) =>
      queryClient.fetchQuery({
        queryKey: ["album", album.id],
        queryFn: () => getAlbum(album.id),
      }),
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
      // Offline none of these may be downloaded, in which case playTracks
      // leaves the queue alone rather than stranding the player.
      if (!playTracks(tracks, 0, { shuffleFromRandom: true, source })) {
        showErrorToast(t("app.home.playErrorMessage"));
      }
    } catch {
      showErrorToast(t("app.home.playErrorMessage"));
    } finally {
      setPreparing(false);
    }
  };

  const handleShufflePress = () => {
    setShuffle(!shuffle);
  };

  return (
    <Box className="h-full">
      <DetailStickyHeader title={heading} style={headerStyle} />
      <AnimatedLegendList
        recycleItems
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
            <DetailHero title={heading} />
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
