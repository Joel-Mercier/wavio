import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
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
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useArtist, useInfiniteArtistSongs } from "@/hooks/backend/useBrowsing";
import { useHasPlayableTracks, useOfflineTracks } from "@/hooks/offline";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import useImageColors from "@/hooks/useImageColors";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import { artistTracksFromDownloads } from "@/services/offline/collections";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import useQueue, { MAX_QUEUE_TRACKS, type QueueSource } from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";

const AnimatedBox = Animated.createAnimatedComponent(Box);
const SKELETON_DATA = loadingData(16);
const EMPTY_DATA: Child[] = [];

export default function AllSongs() {
  const [white, black, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-black",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const { showErrorToast } = useSettingsToast();
  const { data } = useArtist(id);
  const {
    data: songsData,
    isLoading: isLoadingServer,
    error: serverError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteArtistSongs(id);
  const serverSongs = useMemo(
    () =>
      songsData?.pages.flatMap((page) => page.artistSongs?.song ?? []) ??
      EMPTY_DATA,
    [songsData],
  );

  // The paged list isn't persisted, but the artist's album list is: offline,
  // fall back to the downloaded tracks of those albums.
  const isOnline = useIsOnline();
  const offlineTracks = useOfflineTracks(!isOnline);
  const albums = data?.artist?.album;
  const offlineSongs = useMemo(
    () =>
      offlineTracks && albums
        ? artistTracksFromDownloads(offlineTracks, albums)
        : null,
    [offlineTracks, albums],
  );
  const offlineFallbackActive =
    !isOnline && serverSongs.length === 0 && offlineSongs != null;
  const songs = offlineFallbackActive ? offlineSongs : serverSongs;
  const isLoading = isLoadingServer && !offlineFallbackActive;
  const error = offlineFallbackActive ? null : serverError;
  // Summed from the discography, so the count is right before every page is in.
  const discographySongCount = useMemo(
    () => (albums ?? []).reduce((total, a) => total + (a.songCount ?? 0), 0),
    [albums],
  );
  const songCount =
    !offlineFallbackActive && (isLoading || hasNextPage)
      ? Math.max(discographySongCount, songs.length)
      : songs.length;
  const addRecentPlay = useRecentPlays((store) => store.addRecentPlay);
  const colors = useImageColors(artworkUrl(data?.artist?.coverArt));
  const topColor =
    (colors?.platform === "ios"
      ? colors.primary
      : colors?.muted === black
        ? colors?.darkVibrant
        : colors?.muted) || black;
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

  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const trackIdSet = useMemo(() => new Set(songs.map((t) => t.id)), [songs]);
  const isPlayingFromList = !!(playingTrack && trackIdSet.has(playingTrack.id));
  const hasPlayableTracks = useHasPlayableTracks(songs);

  const handleTrackPressCallback = useCallback(() => {
    if (!data?.artist) return;
    addRecentPlay({
      id,
      title: data.artist.name,
      type: "artist",
      coverArt: data.artist.coverArt,
    });
  }, [addRecentPlay, data?.artist, id]);

  const songsSource = useMemo<QueueSource>(
    () => ({ type: "allSongs", name: data?.artist?.name ?? "" }),
    [data?.artist],
  );
  const [preparing, setPreparing] = useState(false);

  // The queue holds at most MAX_QUEUE_TRACKS, so that's as far as a play press
  // pages in; the rest of a compilation artist's list is never fetched for it.
  const loadPlayWindow = async (): Promise<Child[]> => {
    if (offlineFallbackActive) return songs;
    let loaded = serverSongs;
    let more = hasNextPage;
    while (more && loaded.length < MAX_QUEUE_TRACKS) {
      const result = await fetchNextPage();
      if (result.isError) break;
      loaded =
        result.data?.pages.flatMap((page) => page.artistSongs?.song ?? []) ??
        loaded;
      more = result.hasNextPage;
    }
    return loaded;
  };

  const handlePlayPress = async () => {
    if (isPlayingFromList) {
      togglePlayPause();
      return;
    }
    if (preparing) return;
    setPreparing(true);
    try {
      const tracks = await loadPlayWindow();
      if (tracks.length === 0) return;
      if (
        !playTracks(tracks.map(childToTrack), 0, {
          shuffleFromRandom: true,
          source: songsSource,
        })
      ) {
        showErrorToast(t("app.home.playErrorMessage"));
        return;
      }
      handleTrackPressCallback();
    } catch {
      showErrorToast(t("app.home.playErrorMessage"));
    } finally {
      setPreparing(false);
    }
  };

  const shuffle = useQueue((store) => store.shuffle);
  const setShuffle = useQueue((store) => store.setShuffle);
  const handleShufflePress = () => {
    setShuffle(!shuffle);
  };

  const handleTrackPress = useTrackListPress(songs, songsSource);

  const keyExtractor = useCallback(
    (item: Child, index: number) => item.id ?? String(index),
    [],
  );
  const renderRow = useCallback(
    ({ item, index }: { item: Child; index: number }) =>
      isLoading ? (
        <TrackListItemSkeleton index={index} className="px-6" />
      ) : (
        <TrackListItem
          track={item}
          index={index}
          className="px-6"
          onPress={handleTrackPress}
          onPlayCallback={handleTrackPressCallback}
        />
      ),
    [isLoading, handleTrackPress, handleTrackPressCallback],
  );

  return (
    <Box className="h-full bg-black">
      <AnimatedBox
        className="w-full z-10 absolute top-0 left-0 right-0"
        style={[headerStyle]}
      >
        <LinearGradient colors={[topColor, black]} locations={[0, 0.7]}>
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
              {data?.artist?.name}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </AnimatedBox>
      <AnimatedLegendList
        recycleItems
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingBottom: screenBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
        data={isLoading ? SKELETON_DATA : songs}
        keyExtractor={keyExtractor}
        renderItem={renderRow}
        ListHeaderComponent={
          <>
            <LinearGradient
              colors={[topColor, black]}
              className="h-48"
              style={{ height: 192 }}
            >
              <Box
                className="bg-black/25 flex-1"
                style={{ paddingTop: insets.top }}
              >
                <VStack className="mt-6 px-6 items-start justify-between h-full -mb-12">
                  <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
                    <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                      <ArrowLeft size={24} color={white} />
                    </Box>
                  </FadeOutScaleDown>
                  <Heading
                    numberOfLines={2}
                    className="text-white mb-12 font-bold"
                    size="xl"
                  >
                    {data?.artist?.name}
                  </Heading>
                </VStack>
              </Box>
            </LinearGradient>
            <VStack className="px-6 bg-black">
              <Text className="text-primary-100 mt-4" numberOfLines={1}>
                {t("app.shared.songCount", { count: songCount })}
              </Text>
              <HStack className="items-center justify-end my-4">
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
                    disabled={
                      preparing || (!isPlayingFromList && !hasPlayableTracks)
                    }
                  />
                </HStack>
              </HStack>
              <Heading className="text-white mb-4" size="lg">
                {t("app.artists.allSongs")}
              </Heading>
              {error && <ErrorDisplay error={error} />}
            </VStack>
          </>
        }
        ListEmptyComponent={<EmptyDisplay />}
        ListFooterComponent={
          isFetchingNextPage ? (
            <Box className="py-6">
              <ActivityIndicator color={emerald500} />
            </Box>
          ) : null
        }
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
