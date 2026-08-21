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
import { ActivityIndicator, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import AlbumLayoutToggle from "@/components/albums/AlbumLayoutToggle";
import AlbumListItem from "@/components/albums/AlbumListItem";
import AlbumListItemSkeleton from "@/components/albums/AlbumListItemSkeleton";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SortOptionsSheet, {
  type SortLabels,
  useSortFieldLabel,
} from "@/components/SortOptionsSheet";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useInfiniteAlbumList2 } from "@/hooks/backend/useLists";
import { useSearch3 } from "@/hooks/backend/useSearching";
import { useOfflineAlbums } from "@/hooks/offline";
import { useAlbumScreenLayout } from "@/hooks/useAlbumScreenLayout";
import { useAlbumSort } from "@/hooks/useAlbumSort";
import useDebounce from "@/hooks/useDebounce";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import {
  ALBUM_SORT_SPECS,
  type AlbumSortField,
  type AlbumSortType,
  DEFAULT_ALBUM_SORT,
  OFFLINE_ALBUM_SORT_FIELDS,
} from "@/utils/albumSort";
import { gridColumnCount } from "@/utils/grid";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import {
  availableSortFields,
  effectiveSort,
  parseSortType,
  sortItems,
} from "@/utils/sort";
import { cn } from "@/utils/tailwind";

export default function AllAlbumsScreen() {
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
  const { width } = useWindowDimensions();
  const { layout, toggle } = useAlbumScreenLayout("library-albums");
  const gridColumns =
    layout === "grid"
      ? gridColumnCount(width, {
          minItemWidth: 160,
          minColumns: 3,
          maxColumns: 5,
        })
      : 1;
  const form = useForm({ defaultValues: { query: "" } });
  const query = useSelector(form.store, (state) => state.values.query);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounce = useDebounce(150);
  const listRef = useRef<FlashListRef<AlbumID3>>(null);

  useEffect(() => {
    debounce(() => setDebouncedQuery(query));
  }, [query, debounce]);

  const isSearching = debouncedQuery.length > 0;

  // This list is paginated, so it can't be ordered client-side: only the
  // fetched pages are in memory. The order goes into the backend call as an
  // album-list type (+ direction where the backend has one) — see
  // utils/albumSort.ts.
  const setAllAlbumsSort = useApp((store) => store.setAllAlbumsSort);
  const bottomSheetSortModalRef = useRef<BottomSheetModal>(null);
  const {
    sortFields: serverSortFields,
    activeSort: serverSort,
    persistedSort,
    lockedDirections,
    listParams,
    isRandom,
    resolve: resolveSort,
  } = useAlbumSort({ probeCoverage: true });

  // Editing the query — or the sort — swaps the result set; without this the
  // list keeps its old offset and hides the new top rows (notably when
  // deleting characters).
  // biome-ignore lint/correctness/useExhaustiveDependencies: listParams is the trigger, not a read value
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [debouncedQuery, listParams.type, listParams.order]);

  const {
    data: browseData,
    isLoading: isLoadingBrowse,
    error: browseError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchBrowse,
  } = useInfiniteAlbumList2(
    { ...listParams, musicFolderId },
    { enabled: !isSearching },
  );
  const {
    data: searchData,
    isLoading: isLoadingSearch,
    error: searchError,
  } = useSearch3(debouncedQuery, {
    albumCount: 100,
    albumOffset: 0,
    artistCount: 0,
    songCount: 0,
    musicFolderId,
  });

  const browseAlbums = useMemo(
    () =>
      browseData?.pages.flatMap((page) => page.albumList2?.album ?? []) ?? [],
    [browseData],
  );
  // Offline the paginated browse has no data (infinite queries aren't
  // persisted) and search3 is paused — fall back to the album collections the
  // extended-offline library sync registered, filtered client-side while
  // searching.
  const isOnline = useIsOnline();
  const offlineAlbums = useOfflineAlbums(!isOnline);
  // The fallback holds every downloaded album in one array, so there the same
  // fields sort client-side. A downloaded collection carries no play count,
  // last-played date or rating, so `hasSortData` drops those rows on its own.
  const offlineSortFields = useMemo(
    () =>
      availableSortFields(
        offlineAlbums ?? [],
        ALBUM_SORT_SPECS,
        OFFLINE_ALBUM_SORT_FIELDS,
      ),
    [offlineAlbums],
  );
  const offlineSort = effectiveSort(
    persistedSort,
    offlineSortFields,
    DEFAULT_ALBUM_SORT,
  );
  const albums = useMemo(() => {
    if (isSearching) {
      if (isOnline) return searchData?.searchResult3?.album ?? [];
      const query = debouncedQuery.toLowerCase();
      return (offlineAlbums ?? []).filter(
        (album) =>
          album.name.toLowerCase().includes(query) ||
          (album.artist ?? "").toLowerCase().includes(query),
      );
    }
    if (browseAlbums.length > 0 || isOnline) return browseAlbums;
    return offlineAlbums
      ? sortItems(offlineAlbums, offlineSort, ALBUM_SORT_SPECS)
      : [];
  }, [
    isSearching,
    isOnline,
    searchData,
    debouncedQuery,
    offlineAlbums,
    offlineSort,
    browseAlbums,
  ]);
  // Downloaded albums are renderable offline whichever list ends up on screen —
  // enough to drop the skeletons and to keep a stale error from a previous
  // online attempt from blocking them.
  const offlineDataAvailable = !isOnline && (offlineAlbums?.length ?? 0) > 0;
  // The fallback is only *rendering* when the paginated browse has no cached
  // pages left to show (see `albums`): going offline mid-session leaves those
  // pages in memory and they keep the server's order, so the header, the
  // sheet's field list and the direction locks have to go on describing the
  // server sort that produced them rather than the offline one.
  const offlineFallbackActive =
    offlineDataAvailable && browseAlbums.length === 0;
  const isLoading =
    (isSearching ? isLoadingSearch : isLoadingBrowse) && !offlineDataAvailable;
  const error = offlineDataAvailable
    ? null
    : isSearching
      ? searchError
      : browseError;

  // Offline an album's `created` is when it was downloaded, not when the
  // server gained it (hooks/offline/useOfflineAlbums), so the row is renamed
  // rather than left claiming something the fallback can't know.
  const sortLabels = useMemo<SortLabels<AlbumSortField> | undefined>(
    () =>
      offlineFallbackActive
        ? { addedAt: t("app.shared.sort.downloadedAt") }
        : undefined,
    [offlineFallbackActive, t],
  );
  const sortFieldLabel = useSortFieldLabel(sortLabels);

  const sortFields = offlineFallbackActive
    ? offlineSortFields
    : serverSortFields;
  const activeSort = offlineFallbackActive ? offlineSort : serverSort;
  const activeSortField = parseSortType(activeSort).field;
  // Offline the whole list is in memory, so every field flips freely there —
  // the backend locks only apply to the paginated server browse.
  const activeLockedDirections = offlineFallbackActive
    ? undefined
    : lockedDirections;
  // The sheet renders no arrow for a direction-less field (random), so the
  // collapsed trigger must not either — "↑ Random" asserts an order that
  // doesn't exist.
  const showSortDirection =
    activeLockedDirections?.[activeSortField] !== "none";
  // Search returns relevance order on every backend, so the control is hidden
  // there rather than lying; > 1 because a single option is no choice.
  const showSortControl = sortFields.length > 1 && !isSearching;

  const handleSearchClearPress = () => {
    form.setFieldValue("query", "");
  };

  const handlePresentSortModalPress = () => {
    bottomSheetSortModalRef.current?.present();
  };

  const handleSortSelect = (next: AlbumSortType) => {
    const resolved = offlineFallbackActive ? next : resolveSort(next);
    // Re-picking the direction-less random row is the only way to ask for a new
    // shuffle, and it produces the same sort string — so the store write is a
    // no-op, the query key is unchanged and nothing downstream would react.
    // Refetch instead: every backend re-seeds a random order per request.
    if (resolved === activeSort && parseSortType(resolved).field === "random") {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      refetchBrowse();
    }
    setAllAlbumsSort(resolved);
  };

  return (
    <Box className="h-full flex-1">
      <Box
        className="bg-primary-600 px-6 py-6 mb-6"
        style={{ paddingTop: insets.top + 24 }}
      >
        <HStack className="items-center justify-between mb-4">
          <HStack className="items-center flex-1">
            <FadeOutScaleDown
              className="mr-4"
              onPress={() => goBackOrHome(router)}
            >
              <ArrowLeft size={24} color={white} />
            </FadeOutScaleDown>
            <Heading className="text-white" size="xl">
              {t("app.library.allAlbums")}
            </Heading>
          </HStack>
          <AlbumLayoutToggle layout={layout} onPress={toggle} />
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
      {error && <ErrorDisplay error={error as Error} />}
      {!error && (
        <FlashList
          ref={listRef}
          key={`all-albums-${layout}-${gridColumns}`}
          // Off by default it keeps the visible item pinned when the filtered
          // set changes above the viewport, which hides the new top matches on
          // query edits and overrides our scroll-to-top. We only ever append
          // (pagination), so position preservation isn't needed here.
          maintainVisibleContentPosition={{ disabled: true }}
          data={isLoading ? loadingData(12) : albums}
          numColumns={gridColumns}
          extraData={layout}
          keyExtractor={(item, index) =>
            isLoading ? `skeleton-${index}` : (item as AlbumID3).id
          }
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
            showSortControl ? (
              <HStack
                className={cn(
                  "mb-4",
                  // The grid layout already pads the container by 16.
                  layout === "grid" ? "px-2" : "px-6",
                )}
              >
                <FadeOutScaleDown onPress={handlePresentSortModalPress}>
                  <HStack className="items-center gap-x-2">
                    {!showSortDirection ? null : activeSort.endsWith("Desc") ? (
                      <ArrowDown size={16} color={white} />
                    ) : (
                      <ArrowUp size={16} color={white} />
                    )}
                    <Text className="text-white font-bold">
                      {sortFieldLabel(activeSortField)}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              </HStack>
            ) : null
          }
          ListEmptyComponent={() =>
            isLoading ? null : isSearching && !debouncedQuery ? null : (
              <EmptyDisplay />
            )
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <Box className="py-6">
                <ActivityIndicator color={emerald500} />
              </Box>
            ) : null
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: screenBottomPadding,
            paddingHorizontal: layout === "grid" ? 16 : 0,
          }}
          onEndReached={() => {
            // `random` re-seeds per request, so its single page is the list.
            if (
              !isSearching &&
              !isRandom &&
              hasNextPage &&
              !isFetchingNextPage
            ) {
              fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
        />
      )}
      <SortOptionsSheet
        ref={bottomSheetSortModalRef}
        fields={sortFields}
        sort={activeSort}
        onSelect={handleSortSelect}
        labels={sortLabels}
        lockedDirections={activeLockedDirections}
      />
    </Box>
  );
}
