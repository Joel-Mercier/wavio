import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { usePlaylists } from "@/hooks/backend/usePlaylists";
import { useIsPlaying } from "@/hooks/player";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { getPlaylist } from "@/services/backend/playlists";
import type { Playlist } from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import useQueue, { MAX_QUEUE_TRACKS, type QueueSource } from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";
import { loadingData } from "@/utils/loadingData";
import { mapWithConcurrency } from "@/utils/mapWithConcurrency";
import { shuffleWithSeed } from "@/utils/shuffle";
import EmptyDisplay from "../EmptyDisplay";
import ErrorDisplay from "../ErrorDisplay";
import PlayPauseButton from "../PlayPauseButton";
import ShuffleToggle from "../ShuffleToggle";
import { HStack } from "../ui/hstack";
import { VStack } from "../ui/vstack";
import PlaylistListItem from "./PlaylistListItem";
import PlaylistListItemSkeleton from "./PlaylistListItemSkeleton";

const SOURCE_ID = "home-playlists";

export default function YourPlaylistsDetail() {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  const { showErrorToast } = useSettingsToast();
  const screenBottomPadding = useScreenBottomPadding();
  const queryClient = useQueryClient();
  const [seed] = useState(() => Date.now());
  const offsetY = useSharedValue(0);
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offsetY.value, [0, 50], [0, 1], Extrapolation.CLAMP),
  }));
  const scrollHandler = useAnimatedScrollHandler((event) => {
    offsetY.value = event.contentOffset.y;
  });
  const { data, isLoading, error } = usePlaylists({});
  const playlists = useMemo<Playlist[]>(() => {
    const all = data?.playlists?.playlist ?? [];
    return shuffleWithSeed(all, seed);
  }, [data, seed]);
  const heading = t("app.home.yourPlaylists");
  const source = useMemo<QueueSource>(
    () => ({ type: "playlistList", name: heading, id: SOURCE_ID }),
    [heading],
  );
  const queueSource = useQueue((store) => store.source);
  const isActiveSource =
    queueSource?.type === "playlistList" && queueSource.id === SOURCE_ID;
  const isPlaying = useIsPlaying();
  const shuffle = useQueue((store) => store.shuffle);
  const setShuffle = useQueue((store) => store.setShuffle);
  const [preparing, setPreparing] = useState(false);
  const canPlay = !preparing && playlists.length > 0;

  // Fetch playlists in concurrency-limited batches, stopping once the queue
  // cap is covered — the store would drop the excess anyway, so fetching every
  // remaining playlist would be wasted requests.
  const buildTracks = async () => {
    const tracks: ReturnType<typeof childToTrack>[] = [];
    for (
      let i = 0;
      i < playlists.length && tracks.length < MAX_QUEUE_TRACKS;
      i += 4
    ) {
      const results = await mapWithConcurrency(
        playlists.slice(i, i + 4),
        4,
        (playlist) =>
          queryClient.fetchQuery({
            queryKey: ["playlist", playlist.id],
            queryFn: () => getPlaylist(playlist.id),
          }),
      );
      tracks.push(
        ...results
          .flatMap((result) => result?.playlist?.entry ?? [])
          .map(childToTrack),
      );
    }
    return tracks;
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
        onScroll={scrollHandler}
        data={isLoading ? loadingData(12) : playlists}
        renderItem={({ item, index }: { item: Playlist; index: number }) =>
          isLoading ? (
            <PlaylistListItemSkeleton index={index} />
          ) : (
            <Box className="bg-black">
              <PlaylistListItem
                playlist={item}
                index={index}
                layout="vertical"
              />
            </Box>
          )
        }
        ListHeaderComponent={
          <>
            <DetailHero title={heading} />
            <VStack className="px-6">
              <HStack className="items-center justify-end mb-4">
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
          </>
        }
        ListEmptyComponent={isLoading ? null : <EmptyDisplay />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingBottom: screenBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
      />
    </Box>
  );
}
