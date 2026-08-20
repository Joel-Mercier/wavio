import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useForm, useSelector } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import Fuse from "fuse.js";
import ArrowDown from "lucide-react-native/dist/esm/icons/arrow-down.mjs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import ArrowUp from "lucide-react-native/dist/esm/icons/arrow-up.mjs";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import AlphabetIndexBar from "@/components/artists/AlphabetIndexBar";
import ArtistListItem from "@/components/artists/ArtistListItem";
import ArtistListItemSkeleton from "@/components/artists/ArtistListItemSkeleton";
import ArtistSectionHeader from "@/components/artists/ArtistSectionHeader";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SortOptionsSheet, {
  useSortFieldLabel,
} from "@/components/SortOptionsSheet";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useArtists } from "@/hooks/backend/useBrowsing";
import { useOfflineArtists } from "@/hooks/offline";
import useDebounce from "@/hooks/useDebounce";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { ArtistID3, IndexID3 } from "@/services/openSubsonic/types";
import { buildArtistIndex, hasCJK } from "@/services/pinyinIndex";
import useApp from "@/stores/app";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import {
  ARTIST_SORT_FIELDS,
  type ArtistSortType,
  artistSortSpecs,
  DEFAULT_ARTIST_SORT,
} from "@/utils/artistSort";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import {
  availableSortFields,
  effectiveSort,
  parseSortType,
  sortItems,
} from "@/utils/sort";

type ArtistRow =
  | {
      type: "header";
      id: string;
      letter: string;
      letterIdx: number;
    }
  | { type: "artist"; id: string; artist: ArtistID3; letterIdx: number };

export default function AllArtistsScreen() {
  const [white, primary50] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-primary-50",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const musicFolderId = useCurrentMusicFolderId();
  const form = useForm({ defaultValues: { query: "" } });
  const query = useSelector(form.store, (state) => state.values.query);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounce = useDebounce(150);
  const listRef = useRef<FlashListRef<ArtistRow>>(null);
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const pinnedSectionRef = useRef(false);
  const bottomSheetSortModalRef = useRef<BottomSheetModal>(null);
  const sortFieldLabel = useSortFieldLabel();
  const sort = useApp((store) => store.allArtistsSort);
  const setAllArtistsSort = useApp((store) => store.setAllArtistsSort);

  useEffect(() => {
    debounce(() => setDebouncedQuery(query));
  }, [query, debounce]);

  const {
    data: serverData,
    isLoading: isLoadingServer,
    error,
  } = useArtists({ musicFolderId });
  // Offline fall back to artists derived from downloaded album collections so
  // an extended-offline library keeps its artist browse without a cached
  // server response; only derived while server data is absent. The fallback
  // also overrides the loading state — offline the paused server query stays
  // "pending" and would show skeletons over renderable data forever.
  const offlineArtistsData = useOfflineArtists(serverData == null);
  const data = serverData ?? offlineArtistsData;
  const isLoading = isLoadingServer && offlineArtistsData == null;

  const allArtists = useMemo<ArtistID3[]>(
    () => data?.artists?.index?.flatMap((i) => i.artist ?? []) ?? [],
    [data],
  );

  // Unlike the album and track browses this list isn't paginated — getArtists
  // returns the whole index in one response on every backend — so the sort runs
  // client-side, which also makes it work unchanged on the offline fallback.
  // The specs are built from the server's ignoredArticles so the flat sort
  // files an article-prefixed name exactly where the section index does.
  const ignoredArticles = data?.artists?.ignoredArticles;
  const sortSpecs = useMemo(
    () => artistSortSpecs(ignoredArticles),
    [ignoredArticles],
  );
  // `availableSortFields` is what hides an option the backend carries no data
  // for (Jellyfin never reports an artist's album count).
  const sortFields = useMemo(
    () => availableSortFields(allArtists, sortSpecs, ARTIST_SORT_FIELDS),
    [allArtists, sortSpecs],
  );
  const activeSort = effectiveSort(sort, sortFields, DEFAULT_ARTIST_SORT);
  const activeSortField = parseSortType(activeSort).field;
  const isSectioned = activeSortField === "alphabetical";

  // Browse mode: under an alphabetical sort keep the backend's grouping so we
  // can render section headers and drive the index bar. Any other field has no
  // letters to scrub through, so it renders as a flat list instead — the bar
  // hides itself on an empty `letters`.
  const { rows, letters, headerRowIndex } = useMemo(() => {
    const rows: ArtistRow[] = [];
    const letters: string[] = [];
    const headerRowIndex: number[] = [];
    if (!isSectioned) {
      for (const artist of sortItems(allArtists, activeSort, sortSpecs)) {
        rows.push({ type: "artist", id: artist.id, artist, letterIdx: -1 });
      }
      return { rows, letters, headerRowIndex };
    }
    // Subsonic/Navidrome build the section index server-side and drop CJK names
    // into "#". When the library has any CJK artist, re-bucket client-side so
    // Chinese names land under their pinyin initial; honor the server's
    // ignoredArticles so Latin grouping stays identical. Pure-Latin libraries
    // keep the untouched server index.
    const rebucket = allArtists.some((artist) => hasCJK(artist.name ?? ""));
    const ascending = ((rebucket
      ? buildArtistIndex(allArtists, { ignoredArticles })
      : (data?.artists?.index ?? [])) ?? []) as IndexID3[];
    // Z→A reverses the groups *and* each group's artists, so headers keep
    // sitting above the artists they name.
    const index = activeSort.endsWith("Desc")
      ? ascending
          .map((group) => ({
            ...group,
            artist: [...(group.artist ?? [])].reverse(),
          }))
          .reverse()
      : ascending;
    index.forEach((group, letterIdx) => {
      letters.push(group.name);
      headerRowIndex.push(rows.length);
      rows.push({
        type: "header",
        id: `header-${group.name}`,
        letter: group.name,
        letterIdx,
      });
      for (const artist of group.artist ?? []) {
        rows.push({ type: "artist", id: artist.id, artist, letterIdx });
      }
    });
    return { rows, letters, headerRowIndex };
  }, [data, allArtists, isSectioned, activeSort, sortSpecs, ignoredArticles]);

  // Editing the query — or the sort — swaps the result set; without this the
  // list keeps its old offset and hides the new top matches (notably when
  // deleting characters), and the index bar stays highlighting a section the
  // new order no longer has at the top.
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeSort is the trigger, not a read value
  useEffect(() => {
    pinnedSectionRef.current = false;
    setCurrentSectionIdx(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [debouncedQuery, activeSort]);

  const fuse = useMemo(
    () => new Fuse(allArtists, { ignoreDiacritics: true, keys: ["name"] }),
    [allArtists],
  );

  const searchRows = useMemo<ArtistRow[]>(() => {
    if (!debouncedQuery) return [];
    return fuse.search(debouncedQuery).map((result) => ({
      type: "artist",
      id: result.item.id,
      artist: result.item,
      letterIdx: -1,
    }));
  }, [fuse, debouncedQuery]);

  const listData = useMemo<ArtistRow[]>(
    () => (debouncedQuery ? searchRows : rows),
    [debouncedQuery, searchRows, rows],
  );

  const showIndexBar = !debouncedQuery && !isLoading && letters.length > 1;

  const handleSelectLetter = useCallback(
    (index: number) => {
      const rowIndex = headerRowIndex[index];
      if (rowIndex == null) return;
      // Keep the picked letter highlighted even when the list can't scroll it
      // to the very top (short tail sections): pin it and ignore the scroll
      // callback until the user scrolls the list themselves.
      pinnedSectionRef.current = true;
      setCurrentSectionIdx(index);
      listRef.current
        ?.scrollToIndex({ index: rowIndex, animated: false, viewPosition: 0 })
        .catch(() => {});
    },
    [headerRowIndex],
  );

  // Highlight the current section in the index bar while scrolling normally.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 0 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: ArtistRow }> }) => {
      if (pinnedSectionRef.current) return;
      const first = viewableItems[0]?.item;
      if (first && first.letterIdx >= 0) {
        setCurrentSectionIdx(first.letterIdx);
      }
    },
  ).current;

  // With only the alphabetical field there is nothing to choose between.
  const showSortControl = sortFields.length > 1 && !debouncedQuery;

  const handleSearchClearPress = () => {
    form.setFieldValue("query", "");
  };

  const handlePresentSortModalPress = () => {
    bottomSheetSortModalRef.current?.present();
  };

  const handleSortSelect = (next: ArtistSortType) => {
    setAllArtistsSort(next);
  };

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
          <Heading className="text-white" size="xl">
            {t("app.library.allArtists")}
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
      {error && <ErrorDisplay error={error as Error} />}
      {!error && (
        <Box className="flex-1 relative">
          <FlashList
            ref={listRef}
            // Off by default it keeps the visible item pinned when the filtered
            // set changes above the viewport, which hides the new top matches on
            // query edits and overrides our scroll-to-top.
            maintainVisibleContentPosition={{ disabled: true }}
            data={isLoading ? (loadingData(12) as ArtistRow[]) : listData}
            keyExtractor={(item, index) =>
              isLoading ? `skeleton-${index}` : item.id
            }
            getItemType={(item) => (isLoading ? "artist" : item.type)}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            onScrollBeginDrag={() => {
              pinnedSectionRef.current = false;
            }}
            renderItem={({
              item,
              index,
            }: {
              item: ArtistRow;
              index: number;
            }) => {
              if (isLoading) {
                return (
                  <ArtistListItemSkeleton index={index} layout="vertical" />
                );
              }
              if (item.type === "header") {
                return <ArtistSectionHeader letter={item.letter} />;
              }
              return (
                <ArtistListItem
                  artist={item.artist}
                  index={index}
                  layout="vertical"
                />
              );
            }}
            ListHeaderComponent={
              showSortControl ? (
                <HStack className="px-6 mb-4">
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
                </HStack>
              ) : null
            }
            ListEmptyComponent={() => (isLoading ? null : <EmptyDisplay />)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: screenBottomPadding,
            }}
          />
          {showIndexBar && (
            <AlphabetIndexBar
              letters={letters}
              currentIndex={currentSectionIdx}
              onSelect={handleSelectLetter}
              insetTop={8}
              insetBottom={screenBottomPadding}
            />
          )}
        </Box>
      )}
      <SortOptionsSheet
        ref={bottomSheetSortModalRef}
        fields={sortFields}
        sort={activeSort}
        onSelect={handleSortSelect}
      />
    </Box>
  );
}
