import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import ArrowDown from "lucide-react-native/dist/esm/icons/arrow-down.mjs";
import ArrowUp from "lucide-react-native/dist/esm/icons/arrow-up.mjs";
import LayoutGrid from "lucide-react-native/dist/esm/icons/layout-grid.mjs";
import List from "lucide-react-native/dist/esm/icons/list.mjs";
import Plus from "lucide-react-native/dist/esm/icons/plus.mjs";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import AddBottomSheet from "@/components/AddBottomSheet";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import LibraryListItem, {
  type Favorites,
  type LibraryAllAlbums,
  type LibraryAllArtists,
  type LibraryFolder,
  type LibraryPodcast,
  type LibraryRadioStation,
} from "@/components/library/LibraryListItem";
import LibraryListItemSkeleton from "@/components/library/LibraryListItemSkeleton";
import SortOptionsSheet, {
  useSortFieldLabel,
} from "@/components/SortOptionsSheet";
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { useMusicFolders } from "@/hooks/backend/useBrowsing";
import { useStarred2 } from "@/hooks/backend/useLists";
import { usePlaylists } from "@/hooks/backend/usePlaylists";
import {
  isCollectionAvailableOffline,
  useDownloadedCollections,
} from "@/hooks/offline";
import { useAlbumScreenLayout } from "@/hooks/useAlbumScreenLayout";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useIsOnline } from "@/hooks/useIsOnline";
import {
  useScopedPodcastFavorites,
  useSyncServerPodcastFavorites,
} from "@/hooks/usePodcastFavorites";
import {
  useScopedRadioFavorites,
  useSyncServerRadioFavorites,
} from "@/hooks/useRadioFavorites";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { isNetworkNoise } from "@/services/errorReporting";
import type {
  AlbumID3,
  ArtistID3,
  Playlist,
} from "@/services/openSubsonic/types";
import useApp, {
  type LibraryBucketFilter,
  type LibraryFilter,
  type LibrarySortField,
} from "@/stores/app";
import useAuth from "@/stores/auth";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import usePodcasts from "@/stores/podcasts";
import { gridColumnCount } from "@/utils/grid";
import { loadingData } from "@/utils/loadingData";
import { parseSortType, sortItems } from "@/utils/sort";
import { cn } from "@/utils/tailwind";

export type LibraryLayout = "list" | "grid";

// The list mixes artists, albums, playlists, podcasts, radio stations and
// folders, so only these two fields mean anything across every row.
const LIBRARY_SORT_FIELDS: LibrarySortField[] = ["addedAt", "alphabetical"];

// "downloaded" is not a bucket of its own: only albums and playlists exist as
// offline collections (`OfflineCollection.kind`), so it narrows those two and
// hides every other bucket instead of listing it unfiltered.
const DOWNLOADABLE_FILTERS: LibraryBucketFilter[] = ["albums", "playlists"];

// Canonical badge order; "downloaded" is placed separately since it depends on
// connectivity and on whether it is active.
const LIBRARY_FILTERS: LibraryBucketFilter[] = [
  "playlists",
  "albums",
  "artists",
  "podcasts",
  "radioStations",
  "folders",
];

export default function LibraryScreen() {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  const setShowDrawer = useApp((store) => store.setShowDrawer);
  const username = useAuth((store) => store.username);
  const isWideLayout = useApp((store) => store.isWideLayout);
  const capabilities = useCapabilities();
  const router = useRouter();
  const sort = useApp((store) => store.librarySort);
  const setSort = useApp((store) => store.setLibrarySort);
  const sortFieldLabel = useSortFieldLabel();
  const { layout, toggle: handleLayoutPress } =
    useAlbumScreenLayout("library-index");
  const filter = useApp((store) => store.libraryFilter);
  const setFilter = useApp((store) => store.setLibraryFilter);
  const taddyPodcastsApiKey = usePodcasts((store) => store.taddyPodcastsApiKey);
  const taddyPodcastsUserId = usePodcasts((store) => store.taddyPodcastsUserId);
  const favoritePodcasts = useScopedPodcastFavorites();
  const podcastsEnabled = Boolean(taddyPodcastsApiKey && taddyPodcastsUserId);
  // Show the Podcasts bucket when Taddy is configured OR the server hosts
  // podcast channels (opensubsonic capability).
  const showPodcasts = podcastsEnabled || capabilities.podcasts;
  const favoriteRadioStations = useScopedRadioFavorites();
  useSyncServerRadioFavorites();
  useSyncServerPodcastFavorites();
  const screenBottomPadding = useScreenBottomPadding();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const gridColumns =
    layout === "grid"
      ? gridColumnCount(width, {
          minItemWidth: 160,
          minColumns: 3,
          maxColumns: 5,
        })
      : 1;
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetModalSortRef = useRef<BottomSheetModal>(null);
  const filterScrollRef = useRef<ScrollView>(null);
  const listRef =
    useRef<
      FlashListRef<
        Playlist &
          AlbumID3 &
          ArtistID3 &
          Favorites &
          LibraryPodcast &
          LibraryFolder &
          LibraryRadioStation &
          LibraryAllAlbums &
          LibraryAllArtists
      >
    >(null);
  const musicFolderId = useCurrentMusicFolderId();
  const isOnline = useIsOnline();
  const queryClient = useQueryClient();
  const downloadedCollections = useDownloadedCollections();
  const {
    data: starredData,
    isLoading: isLoadingStarred,
    isFetching: isFetchingStarred,
    error: starredError,
    refetch: refetchStarred,
  } = useStarred2({ musicFolderId });
  const {
    data: playlistsData,
    isLoading: isLoadingPlaylists,
    isFetching: isFetchingPlaylists,
    error: playlistsError,
    refetch: refetchPlaylists,
  } = usePlaylists({});
  const {
    data: musicFoldersData,
    isFetching: isFetchingMusicFolders,
    refetch: refetchMusicFolders,
  } = useMusicFolders();

  // Active filters slide to the front so the one in use is never buried at the
  // end of a scrolled-off row; deselecting drops the badge back into its
  // canonical spot. Offline that spot is first for "downloaded" (the most
  // useful filter with no server), last when online. The sort is stable, so
  // badges keep their relative order within the active / inactive groups.
  const orderedFilters = useMemo(() => {
    const options = LIBRARY_FILTERS.filter(
      (option) => option !== "podcasts" || showPodcasts,
    );
    const withDownloaded: LibraryFilter[] = isOnline
      ? [...options, "downloaded"]
      : ["downloaded", ...options];
    return withDownloaded.sort(
      (a, b) => Number(filter.includes(b)) - Number(filter.includes(a)),
    );
  }, [filter, isOnline, showPodcasts]);

  const handleFilterPress = (type: LibraryFilter) => {
    setFilter(
      filter.includes(type)
        ? filter.filter((f) => f !== type)
        : [...filter, type],
    );
  };

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handlePresentSortModalPress = useCallback(() => {
    bottomSheetModalSortRef.current?.present();
  }, []);

  const handleSearchPress = () => {
    router.navigate("/(app)/(tabs)/(library)/search");
  };

  const data = useMemo(() => {
    const hasServerData = Boolean(
      starredData?.starred2 || playlistsData?.playlists,
    );
    // Online with nothing loaded yet → null so the skeleton placeholders show.
    // Offline we keep going so saved collections (and podcasts/radio from local
    // stores) still render even without a cached server list.
    if (!hasServerData && isOnline) {
      return null;
    }

    const downloadedFilter = filter.includes("downloaded");
    const bucketFilters = filter.filter((f) => f !== "downloaded");

    const favoritesItem = {
      id: "favorites",
      name: "Favorites",
      isFavorites: true,
      songCount: starredData?.starred2?.song?.length || 0,
    };
    const allArtistsItem = {
      id: "all-artists",
      name: "All artists",
      isAllArtists: true,
    };
    const allAlbumsItem = {
      id: "all-albums",
      name: "All albums",
      isAllAlbums: true,
    };

    // Offline only: merge saved collections into their bucket so downloaded
    // playlists/albums appear even when the server list query isn't cached.
    // Deduped by id (server entry wins, since it carries richer metadata).
    const mergeOffline = <T extends { id: string }>(
      serverItems: T[],
      kind: "playlist" | "album",
    ): T[] => {
      let merged = serverItems;
      if (!isOnline) {
        const ids = new Set(serverItems.map((item) => item.id));
        const offlineItems = downloadedCollections
          .filter((c) => c.kind === kind && !ids.has(c.id))
          .map((c) =>
            kind === "playlist"
              ? {
                  id: c.id,
                  name: c.name,
                  songCount: c.songCount,
                  coverArt: c.coverArt,
                  owner: c.owner,
                  created: c.savedAt,
                }
              : {
                  id: c.id,
                  name: c.name,
                  songCount: c.songCount,
                  coverArt: c.coverArt,
                  artist: c.artist,
                  artistId: c.artistId,
                  year: c.year,
                  created: c.savedAt,
                },
          ) as unknown as T[];
        merged = [...serverItems, ...offlineItems];
      }
      if (downloadedFilter) {
        // Same criterion as the row's downloaded badge, so the filter can never
        // hide a row that is badged as downloaded.
        merged = merged.filter((item) =>
          isCollectionAvailableOffline(queryClient, kind, item.id),
        );
      }
      return merged;
    };

    // "downloaded" combines with the bucket filters instead of adding a bucket,
    // so a bucket shows only when it is selected AND (when "downloaded" is on)
    // it can hold downloaded content — never one filter OR the other.
    const noBucketFilter = bucketFilters.length === 0;
    const showBucket = (bucket: LibraryBucketFilter) =>
      (noBucketFilter || bucketFilters.includes(bucket)) &&
      (!downloadedFilter || DOWNLOADABLE_FILTERS.includes(bucket));

    let data = [];
    if (showBucket("artists") && starredData?.starred2?.artist) {
      data.push(starredData.starred2.artist);
    }
    if (showBucket("albums")) {
      data.push(mergeOffline(starredData?.starred2?.album ?? [], "album"));
    }
    if (showBucket("playlists")) {
      // Favorites is a browse entry, not a downloadable collection.
      if (
        bucketFilters.includes("playlists") &&
        hasServerData &&
        !downloadedFilter
      ) {
        data.push(favoritesItem);
      }
      data.push(
        mergeOffline(playlistsData?.playlists?.playlist ?? [], "playlist"),
      );
    }
    if (showPodcasts && showBucket("podcasts")) {
      data.push(
        favoritePodcasts.map((p) => ({
          id: p.uuid,
          name: p.name,
          isPodcast: true,
          imageUrl: p.imageUrl,
          authorName: p.authorName,
          dateAdded: p.dateAdded,
          podcastSource: p.source,
          coverArt: p.coverArt,
          url: p.url,
        })),
      );
    }
    if (showBucket("radioStations")) {
      data.push(
        favoriteRadioStations.map((r) => ({
          id: r.id,
          name: r.name,
          isRadioStation: true,
          imageUrl: r.imageUrl,
          streamUrl: r.streamUrl,
          homePageUrl: r.homePageUrl,
          tags: r.tags,
          source: r.source,
          dateAdded: r.dateAdded,
        })),
      );
    }
    if (showBucket("folders") && musicFoldersData?.musicFolders?.musicFolder) {
      data.push(
        musicFoldersData.musicFolders.musicFolder.map((f) => ({
          id: String(f.id),
          name: f.name ?? `Library ${f.id}`,
          isFolder: true,
        })),
      );
    }
    data = data.flat();
    // Each row shape carries at most one of these dates; 0 (rather than
    // undefined) keeps undated rows sorting as "oldest" instead of being pinned
    // last, which is how this list has always behaved.
    const sortTime = (item: (typeof data)[number]) => {
      const value =
        ("starred" in item ? item.starred : undefined) ??
        ("created" in item ? item.created : undefined);
      if (value) return new Date(value).getTime();
      if ("dateAdded" in item && typeof item.dateAdded === "number") {
        return item.dateAdded;
      }
      return 0;
    };
    const sorted = sortItems(data, sort, {
      addedAt: { value: sortTime, always: true },
      alphabetical: { value: (item) => item.name, always: true },
    });
    // Pin Favorites + the "all albums/artists" browse entries at the top of the
    // unfiltered library so the sort never scatters them into the list. Offline
    // they stay pinned as long as downloaded collections can back the browse
    // screens (extended offline mode caches the whole library).
    const hasOfflineCollections = !isOnline && downloadedCollections.length > 0;
    if (
      noBucketFilter &&
      !downloadedFilter &&
      (hasServerData || hasOfflineCollections)
    ) {
      return [favoritesItem, allArtistsItem, allAlbumsItem, ...sorted];
    }
    return sorted;
  }, [
    starredData,
    playlistsData,
    filter,
    sort,
    showPodcasts,
    favoritePodcasts,
    favoriteRadioStations,
    musicFoldersData,
    isOnline,
    downloadedCollections,
    queryClient,
  ]);

  const isLoading = isLoadingPlaylists || isLoadingStarred;
  // A connectivity-class failure (server unreachable / gateway 5xx) is not a
  // fatal error here: fall through to the list so the offline-merged content
  // (downloaded collections, local favorites) — or the empty state — shows
  // instead of a raw error screen. Genuine errors still surface ErrorDisplay.
  // Classify each query's error independently: a network-noise failure on one
  // query must not mask a genuine error on the other (which `a || b` would, by
  // collapsing both into a single value before classification).
  const error = [playlistsError, starredError].find(
    (e) => e && !isNetworkNoise(e),
  );

  // Changing the sort or filter swaps the list contents; without this the
  // FlashList keeps its old offset and can land mid-list or at the bottom. Reset
  // to the top so the new ordering / filtered set starts in view.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [sort, filter]);

  // Toggling a filter reorders the badges, so a row the user had scrolled to
  // the end no longer holds what they were looking at — bring it back to the
  // start, where the badge they just toggled now sits.
  useEffect(() => {
    filterScrollRef.current?.scrollTo({ x: 0, animated: true });
  }, [filter]);

  return (
    <Box className="h-full">
      <>
        <Box className="px-6" style={{ paddingTop: insets.top }}>
          <HStack
            className={cn("items-center justify-between", {
              "mt-6": !isWideLayout,
            })}
          >
            <HStack className="items-center gap-x-4">
              <FadeOutScaleDown
                testID="open-drawer-button"
                onPress={() => setShowDrawer(true)}
              >
                <Avatar className="border-emerald-500 border-2 w-10 h-10">
                  <AvatarFallbackText className="font-body ">
                    {username}
                  </AvatarFallbackText>
                </Avatar>
              </FadeOutScaleDown>
              <Heading className="text-white" size="2xl">
                {t("app.library.title")}
              </Heading>
            </HStack>
            <HStack className="items-center gap-x-4">
              <FadeOutScaleDown
                testID="library-search-button"
                onPress={handleSearchPress}
              >
                <Search color={white} />
              </FadeOutScaleDown>
              <FadeOutScaleDown
                testID="library-create-button"
                onPress={handlePresentModalPress}
              >
                <Plus color={white} />
              </FadeOutScaleDown>
            </HStack>
          </HStack>
          <Box className="relative -mx-6 my-6">
            <ScrollView
              ref={filterScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              className="gap-x-4"
              contentContainerStyle={{ paddingHorizontal: 24 }}
            >
              {orderedFilters.map((option, index) => (
                <FadeOutScaleDown
                  key={option}
                  onPress={() => handleFilterPress(option)}
                >
                  <Badge
                    className={cn("rounded-full bg-gray-800 px-4 py-1", {
                      "bg-emerald-500 text-primary-800":
                        filter.includes(option),
                      "mr-2": index < orderedFilters.length - 1,
                    })}
                  >
                    <BadgeText className="normal-case text-md text-white">
                      {t(`app.shared.filters.${option}`)}
                    </BadgeText>
                  </Badge>
                </FadeOutScaleDown>
              ))}
            </ScrollView>
            <LinearGradient
              colors={["#000000", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 24,
              }}
            />
            <LinearGradient
              colors={["transparent", "#000000"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              pointerEvents="none"
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                bottom: 0,
                width: 24,
              }}
            />
          </Box>
        </Box>
        <HStack className="px-6 pb-4 items-center justify-between">
          <FadeOutScaleDown onPress={handlePresentSortModalPress}>
            <HStack className="items-center gap-x-2">
              {sort.endsWith("Desc") ? (
                <ArrowDown size={16} color={white} />
              ) : (
                <ArrowUp size={16} color={white} />
              )}
              <Text className="text-white font-bold">
                {sortFieldLabel(parseSortType(sort).field)}
              </Text>
            </HStack>
          </FadeOutScaleDown>
          <FadeOutScaleDown onPress={handleLayoutPress}>
            {layout === "list" ? (
              <LayoutGrid size={16} color={white} />
            ) : (
              <List size={16} color={white} />
            )}
          </FadeOutScaleDown>
        </HStack>
        {/* {(isLoadingPlaylists || isLoadingStarred) && <Spinner size="large" />} */}
        {error && <ErrorDisplay error={error} />}
      </>
      {!error && (
        <FlashList
          ref={listRef}
          key={`library-${layout}-${gridColumns}`}
          data={
            (isLoading ? loadingData(16) : (data ?? [])) as Array<
              Playlist &
                AlbumID3 &
                ArtistID3 &
                Favorites &
                LibraryPodcast &
                LibraryFolder &
                LibraryRadioStation &
                LibraryAllAlbums &
                LibraryAllArtists
            >
          }
          keyExtractor={(item) => item.id}
          numColumns={gridColumns}
          onRefresh={() => {
            refetchPlaylists();
            refetchStarred();
            refetchMusicFolders();
          }}
          renderItem={({ item, extraData }) => {
            const { layout: itemLayout } = extraData as {
              layout: LibraryLayout;
            };
            return isLoading ? (
              <LibraryListItemSkeleton layout={itemLayout} />
            ) : (
              <LibraryListItem item={item} layout={itemLayout} key={item.id} />
            );
          }}
          extraData={{ layout, gridColumns }}
          ListEmptyComponent={() =>
            isLoading ? null : <EmptyDisplay offline={!isOnline} />
          }
          contentContainerStyle={{
            // Grid cells add their own 8px (px-2) each side; drop the container
            // padding to 16 so the outer edge stays at 24 and every column has
            // equal width. List rows keep the full 24.
            paddingHorizontal: layout === "grid" ? 16 : 24,
            paddingBottom: screenBottomPadding,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}
      <AddBottomSheet ref={bottomSheetModalRef} />
      <SortOptionsSheet
        ref={bottomSheetModalSortRef}
        fields={LIBRARY_SORT_FIELDS}
        sort={sort}
        onSelect={setSort}
      />
    </Box>
  );
}
