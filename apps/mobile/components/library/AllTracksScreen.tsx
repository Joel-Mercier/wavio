import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useForm, useSelector } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import ArrowDown from "lucide-react-native/dist/esm/icons/arrow-down.mjs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import ArrowUp from "lucide-react-native/dist/esm/icons/arrow-up.mjs";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import PlayPauseButton from "@/components/PlayPauseButton";
import ShuffleToggle from "@/components/ShuffleToggle";
import SortOptionsSheet, {
  useSortFieldLabel,
} from "@/components/SortOptionsSheet";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useInfiniteSongs } from "@/hooks/backend/useLists";
import { useHasPlayableTracks, useOfflineTracks } from "@/hooks/offline";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import useDebounce from "@/hooks/useDebounce";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { useSongSort } from "@/hooks/useSongSort";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import { getRandomSongs, getSongs } from "@/services/backend/lists";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import useApp from "@/stores/app";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import useQueue, { MAX_QUEUE_TRACKS, type QueueSource } from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import {
  DEFAULT_SONG_SORT,
  OFFLINE_SONG_SORT_FIELDS,
  SONG_SORT_SPECS,
  type SongSortType,
} from "@/utils/songSort";
import {
  availableSortFields,
  effectiveSort,
  parseSortType,
  sortItems,
} from "@/utils/sort";

const PAGE_SIZE = 50;
// Subsonic caps getRandomSongs at 500, so the play window is filled with a
// couple of pages rather than one big request.
const PLAY_PAGE_SIZE = 500;
// Independent random draws overlap, so a small library can never fill the
// window no matter how many times we ask. Bound the loop instead of spinning.
const RANDOM_SEED_ATTEMPTS = 3;
// Enough rows to fill a tall screen, like the other full-screen track lists.
const SKELETON_DATA = loadingData(16);

export default function AllTracksScreen() {
  const [white, primary50, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-primary-50",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const musicFolderId = useCurrentMusicFolderId();
  const { showErrorToast } = useSettingsToast();
  const form = useForm({ defaultValues: { query: "" } });
  const query = useSelector(form.store, (state) => state.values.query);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounce = useDebounce(150);
  const listRef = useRef<FlashListRef<Child>>(null);

  useEffect(() => {
    debounce(() => setDebouncedQuery(query));
  }, [query, debounce]);

  const isSearching = debouncedQuery.length > 0;

  // This list is paginated, so — unlike every other sorted list in the app — it
  // can't be ordered client-side: only the fetched pages are in memory. The
  // order goes into the backend call instead, which is why not every backend
  // offers one (see utils/songSort.ts).
  const sort = useApp((store) => store.allTracksSort);
  const setAllTracksSort = useApp((store) => store.setAllTracksSort);
  const bottomSheetSortModalRef = useRef<BottomSheetModal>(null);
  const sortFieldLabel = useSortFieldLabel();
  // Falls back to the backend's own order when the saved field isn't offerable
  // here, without overwriting the preference.
  const {
    sortFields: serverSortFields,
    activeSort: serverSort,
    sortParam: browseSortParam,
  } = useSongSort();
  // Searching, the order is the backend's search order on every backend (see
  // the getSongs implementations), so the control is hidden rather than lying.
  const sortParam = isSearching ? undefined : browseSortParam;

  // Editing the query — or the sort — swaps the result set; without this the
  // list keeps its old offset and hides the new top rows.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [debouncedQuery, sortParam]);

  const {
    data,
    isLoading: isLoadingServer,
    error: serverError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteSongs({
    query: debouncedQuery,
    size: PAGE_SIZE,
    sort: sortParam,
    musicFolderId,
  });
  const serverSongs = useMemo(
    () => data?.pages.flatMap((page) => page.songs?.song ?? []) ?? [],
    [data],
  );

  // Offline the paginated browse has no data (infinite queries aren't
  // persisted) and the server query is paused — fall back to the downloaded
  // tracks, filtered client-side while searching.
  const isOnline = useIsOnline();
  const offlineTracks = useOfflineTracks(!isOnline);
  const offlineFallbackActive = !isOnline && offlineTracks != null;
  // The fallback holds the whole downloaded library in one array, so there the
  // same fields sort client-side. Offered on the same backends as online, minus
  // the ones a downloaded track carries no data for.
  const offlineSortFields = useMemo(
    () =>
      availableSortFields(
        offlineTracks ?? [],
        SONG_SORT_SPECS,
        serverSortFields.filter((field) =>
          OFFLINE_SONG_SORT_FIELDS.includes(field),
        ),
      ),
    [offlineTracks, serverSortFields],
  );
  const offlineSort = effectiveSort(
    sort,
    offlineSortFields,
    DEFAULT_SONG_SORT,
  ) as SongSortType;
  const songs = useMemo(() => {
    if (!offlineFallbackActive || !offlineTracks) return serverSongs;
    if (isSearching) {
      // A plain substring filter rather than a fuzzy index: offline this list is
      // the whole synced library, and building an index over it would run on
      // the JS thread (same trade-off as the albums browse).
      const needle = debouncedQuery.toLowerCase();
      return offlineTracks.filter(
        (track) =>
          (track.title ?? "").toLowerCase().includes(needle) ||
          (track.artist ?? "").toLowerCase().includes(needle) ||
          (track.album ?? "").toLowerCase().includes(needle),
      );
    }
    return sortItems(offlineTracks, offlineSort, SONG_SORT_SPECS);
  }, [
    offlineFallbackActive,
    serverSongs,
    offlineTracks,
    isSearching,
    debouncedQuery,
    offlineSort,
  ]);
  const sortFields = offlineFallbackActive
    ? offlineSortFields
    : serverSortFields;
  const activeSort = offlineFallbackActive ? offlineSort : serverSort;
  const activeSortField = parseSortType(activeSort).field;
  const isLoading = isLoadingServer && !offlineFallbackActive;
  // A stale error from a previous online attempt must not block the offline
  // fallback list.
  const error = offlineFallbackActive ? null : serverError;

  const heading = t("app.library.allTracks");
  const source = useMemo<QueueSource>(
    () => ({ type: "allTracks", name: heading }),
    [heading],
  );
  const handleTrackPress = useTrackListPress(songs, source);
  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  // Membership in the list (the convention elsewhere) can't tell this screen
  // apart from any other: the list *is* the whole library, so every playing
  // track is in it. The queue's own source is the exact test.
  const queueSourceType = useQueue((store) => store.source?.type);
  const isPlayingFromList = !!playingTrack && queueSourceType === "allTracks";
  const hasPlayableTracks = useHasPlayableTracks(songs);
  const shuffle = useQueue((store) => store.shuffle);
  const setShuffle = useQueue((store) => store.setShuffle);
  const [preparing, setPreparing] = useState(false);

  // The visible order, from the top. Offsets come from the running total rather than
  // the page index, so a short page can't make the next one skip rows, and only
  // an empty page stops the loop (a short page can still have more behind it —
  // same rule as useInfiniteSongs). Not routed through react-query: this window
  // is nothing the UI reads back, and its key would be persisted to the cache
  // blob (only ":infinite" keys are excluded from dehydration).
  const buildOrderedWindow = async () => {
    const tracks: Child[] = [];
    while (tracks.length < MAX_QUEUE_TRACKS) {
      const offset = tracks.length;
      const page = await getSongs({
        size: PLAY_PAGE_SIZE,
        offset,
        sort: sortParam,
        musicFolderId,
      });
      const pageSongs = page.songs?.song ?? [];
      if (pageSongs.length === 0) break;
      tracks.push(...pageSongs);
    }
    return tracks.slice(0, MAX_QUEUE_TRACKS);
  };

  // Shuffling reaches across the whole library instead of only its first
  // MAX_QUEUE_TRACKS in server order, so the window is seeded from the server's
  // own random pick. Not routed through react-query: caching a random draw
  // would hand back the same "shuffle" on the next press.
  const buildRandomWindow = async () => {
    const byId = new Map<string, Child>();
    for (let attempt = 0; attempt < RANDOM_SEED_ATTEMPTS; attempt++) {
      const before = byId.size;
      // A server that doesn't implement getRandomSongs rejects rather than
      // returning nothing, which would skip the caller's ordered-window
      // fallback and fail the whole press. Stop and hand back what we have.
      const page = await getRandomSongs({
        size: PLAY_PAGE_SIZE,
        musicFolderId,
      }).catch(() => null);
      if (!page) break;
      for (const song of page.songs?.song ?? []) {
        if (byId.size >= MAX_QUEUE_TRACKS) break;
        byId.set(song.id, song);
      }
      // Nothing new came back: the library is smaller than the window.
      if (byId.size === before || byId.size >= MAX_QUEUE_TRACKS) break;
    }
    return [...byId.values()];
  };

  const handlePlayPress = async () => {
    if (isPlayingFromList) {
      togglePlayPause();
      return;
    }
    if (preparing) return;
    setPreparing(true);
    try {
      // Searching, the visible results *are* the list — playing something else
      // would ignore what the user just typed.
      let tracks =
        isSearching || offlineFallbackActive
          ? songs
          : shuffle
            ? await buildRandomWindow()
            : await buildOrderedWindow();
      // A server that doesn't serve getRandomSongs leaves the shuffle window
      // empty (buildRandomWindow swallows the rejection so this stays reachable).
      // The random draw only widens the pool past the first
      // MAX_QUEUE_TRACKS in server order — playNow still shuffles the queue and
      // playTracks still picks a random lead — so falling back to the ordered
      // window costs reach, not shuffling.
      if (
        tracks.length === 0 &&
        shuffle &&
        !isSearching &&
        !offlineFallbackActive
      ) {
        tracks = await buildOrderedWindow();
      }
      // Whatever the reason, an empty window has to say so: silently returning
      // here is what hid #169 for as long as it did.
      if (tracks.length === 0) {
        showErrorToast(t("app.home.playErrorMessage"));
        return;
      }
      // Offline none of these may be downloaded, in which case playTracks
      // leaves the queue alone rather than stranding the player.
      if (
        !playTracks(tracks.map(childToTrack), 0, {
          shuffleFromRandom: true,
          source,
        })
      ) {
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

  const handleSearchClearPress = () => {
    form.setFieldValue("query", "");
  };

  const handlePresentSortModalPress = () => {
    bottomSheetSortModalRef.current?.present();
  };

  // "Default" is the backend's own order — there is no reverse of it to flip
  // to, so re-tapping the row keeps it ascending instead of silently doing
  // nothing (offline it would reverse the array, which is a different list).
  const handleSortSelect = (next: SongSortType) => {
    setAllTracksSort(
      parseSortType(next).field === "default" ? DEFAULT_SONG_SORT : next,
    );
  };

  const showSortControl = sortFields.length > 0 && !isSearching;

  return (
    <Box className="h-full flex-1">
      <Box
        className="bg-primary-600 px-6 py-6 mb-6"
        style={{ paddingTop: insets.top + 24 }}
      >
        <HStack className="items-center mb-4">
          <FadeOutScaleDown
            className="mr-4"
            onPress={() => goBackOrHome(router)}
          >
            <ArrowLeft size={24} color={white} />
          </FadeOutScaleDown>
          <Heading className="text-white flex-1" size="xl">
            {heading}
          </Heading>
        </HStack>
        <form.Field name="query">
          {(field) => (
            <Input className="border-0">
              <InputSlot className="pl-3">
                <InputIcon as={Search} />
              </InputSlot>
              <InputField
                disableFullscreenUI
                className="text-white text-lg"
                placeholder={t("app.library.search.inputPlaceholder")}
                placeholderTextColor={primary50}
                type="text"
                value={field.state.value}
                onChangeText={field.handleChange}
                onBlur={field.handleBlur}
                enterKeyHint="search"
              />
              {query ? (
                <InputSlot className="pr-3" onPress={handleSearchClearPress}>
                  <InputIcon as={X} />
                </InputSlot>
              ) : null}
            </Input>
          )}
        </form.Field>
      </Box>
      <FlashList
        ref={listRef}
        // Off by default it keeps the visible item pinned when the filtered set
        // changes above the viewport, which hides the new top matches on query
        // edits and overrides our scroll-to-top. We only ever append
        // (pagination), so position preservation isn't needed here.
        maintainVisibleContentPosition={{ disabled: true }}
        data={isLoading ? SKELETON_DATA : songs}
        keyExtractor={(item, index) =>
          isLoading ? `skeleton-${index}` : (item as Child).id
        }
        renderItem={({ item, index }: { item: Child; index: number }) =>
          isLoading ? (
            <TrackListItemSkeleton index={index} className="px-6" />
          ) : (
            <TrackListItem
              track={item}
              index={index}
              onPress={handleTrackPress}
              showCoverArt
              className="px-6"
            />
          )
        }
        ListHeaderComponent={
          <VStack className="px-6">
            <HStack className="items-center justify-between mb-4 gap-x-4">
              {showSortControl ? (
                <FadeOutScaleDown onPress={handlePresentSortModalPress}>
                  <HStack className="items-center gap-x-2">
                    {activeSort.endsWith("Desc") ? (
                      <ArrowDown size={16} color={white} />
                    ) : (
                      <ArrowUp size={16} color={white} />
                    )}
                    <Text className="text-white font-bold">
                      {sortFieldLabel(activeSortField)}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              ) : (
                <Box />
              )}
              <HStack className="items-center gap-x-4">
                <ShuffleToggle active={shuffle} onPress={handleShufflePress} />
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
            {error && <ErrorDisplay error={error as Error} />}
          </VStack>
        }
        ListEmptyComponent={() => (isLoading ? null : <EmptyDisplay />)}
        ListFooterComponent={
          isFetchingNextPage ? (
            <Box className="py-6">
              <ActivityIndicator color={emerald500} />
            </Box>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: screenBottomPadding }}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
      />
      <SortOptionsSheet
        ref={bottomSheetSortModalRef}
        fields={sortFields}
        sort={activeSort}
        onSelect={handleSortSelect}
      />
    </Box>
  );
}
