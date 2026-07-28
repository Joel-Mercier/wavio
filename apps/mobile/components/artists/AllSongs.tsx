import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useAllArtistSongs, useArtist } from "@/hooks/backend/useBrowsing";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import useImageColors from "@/hooks/useImageColors";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import useQueue, { type QueueSource } from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";

const AnimatedBox = Animated.createAnimatedComponent(Box);
const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;

export default function AllSongs() {
  const [white, black] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-black",
  ]) as string[];
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const { data } = useArtist(id);
  const musicFolderId = useCurrentMusicFolderId();
  const {
    data: songsData,
    isLoading,
    error,
  } = useAllArtistSongs(id, {
    name: data?.artist?.name,
    musicFolderId,
  });
  const songs: Child[] = songsData?.artistSongs?.song ?? [];
  const colors = useImageColors(artworkUrl(data?.artist?.coverArt));
  const topColor =
    (colors?.platform === "ios" ? colors.primary : colors?.muted) || black;
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

  const addRecentPlay = useRecentPlays((store) => store.addRecentPlay);
  const handleTrackPressCallback = () => {
    if (data?.artist) {
      addRecentPlay({
        id,
        title: data.artist.name,
        type: "artist",
        coverArt: data.artist.coverArt,
      });
    }
  };

  const songsSource = useMemo<QueueSource>(
    () =>
      data?.artist
        ? { type: "allSongs", name: data.artist.name }
        : { type: "allSongs", name: "" },
    [data?.artist],
  );
  const handlePlayPress = () => {
    if (isPlayingFromList) {
      togglePlayPause();
      return;
    }
    if (songs.length === 0) return;
    playTracks(songs.map(childToTrack), 0, {
      shuffleFromRandom: true,
      source: songsSource,
    });
    handleTrackPressCallback();
  };

  const shuffle = useQueue((store) => store.shuffle);
  const setShuffle = useQueue((store) => store.setShuffle);
  const handleShufflePress = () => {
    setShuffle(!shuffle);
  };

  const handleTrackPress = useTrackListPress(songs, songsSource);

  // Mirror LikedSongs: a single FlashList with one row shape, so the list never
  // nests another virtualized list. Errors render in-place; the empty state
  // falls back to EmptyDisplay without an extra section.
  type Row =
    | { type: "song"; song: Child; index: number }
    | { type: "skeleton"; index: number }
    | { type: "songsEmpty" };

  const rows = useMemo<Row[]>(() => {
    if (isLoading) {
      return loadingData(8).map((_, index) => ({
        type: "skeleton" as const,
        index,
      }));
    }
    if (songs.length === 0) {
      return [{ type: "songsEmpty" }];
    }
    return songs.map((song, index) => ({ type: "song" as const, song, index }));
  }, [isLoading, songs]);

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
      <AnimatedFlashList
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingBottom: screenBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
        data={rows}
        keyExtractor={(item: Row) =>
          item.type === "song"
            ? item.song.id
            : item.type === "skeleton"
              ? `skeleton-${item.index}`
              : item.type
        }
        getItemType={(item: Row) => item.type}
        renderItem={({ item }: { item: Row }) => {
          switch (item.type) {
            case "song":
              return (
                <TrackListItem
                  track={item.song}
                  index={item.index}
                  className="px-6"
                  onPress={handleTrackPress}
                  onPlayCallback={handleTrackPressCallback}
                />
              );
            case "skeleton":
              return (
                <TrackListItemSkeleton index={item.index} className="px-6" />
              );
            case "songsEmpty":
              return error ? <ErrorDisplay error={error} /> : <EmptyDisplay />;
          }
        }}
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
                {t("app.shared.songCount", { count: songs.length })}
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
                  />
                </HStack>
              </HStack>
              <Heading className="text-white mb-4" size="lg">
                {t("app.artists.allSongs")}
              </Heading>
            </VStack>
          </>
        }
      />
    </Box>
  );
}
