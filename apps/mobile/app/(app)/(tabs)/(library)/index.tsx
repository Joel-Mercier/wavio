import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import ArrowDown from "lucide-react-native/dist/esm/icons/arrow-down.mjs";
import ArrowDownUp from "lucide-react-native/dist/esm/icons/arrow-down-up.mjs";
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
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
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
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useMusicFolders } from "@/hooks/backend/useBrowsing";
import { useStarred2 } from "@/hooks/backend/useLists";
import { usePlaylists } from "@/hooks/backend/usePlaylists";
import { useDownloadedCollections } from "@/hooks/offline";
import { useAlbumScreenLayout } from "@/hooks/useAlbumScreenLayout";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
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
import type {
  AlbumID3,
  ArtistID3,
  Playlist,
} from "@/services/openSubsonic/types";
import useApp, { type LibraryFilter } from "@/stores/app";
import useAuth from "@/stores/auth";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import usePodcasts from "@/stores/podcasts";
import { gridColumnCount } from "@/utils/grid";
import { loadingData } from "@/utils/loadingData";
import { cn } from "@/utils/tailwind";

export type LibraryLayout = "list" | "grid";

export default function LibraryScreen() {
  const [white, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const setShowDrawer = useApp((store) => store.setShowDrawer);
  const username = useAuth((store) => store.username);
  const isWideLayout = useApp((store) => store.isWideLayout);
  const capabilities = useCapabilities();
  const router = useRouter();
  const sort = useApp((store) => store.librarySort);
  const setSort = useApp((store) => store.setLibrarySort);
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
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const { handleSheetPositionChange: handleSheetPositionChangeSort } =
    useBottomSheetBackHandler(bottomSheetModalSortRef);
  const musicFolderId = useCurrentMusicFolderId();
  const isOnline = useIsOnline();
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

  const handleSortPress = (type: typeof sort) => {
    bottomSheetModalSortRef.current?.dismiss();
    setSort(type);
  };

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
      if (isOnline) return serverItems;
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
      return [...serverItems, ...offlineItems];
    };

    const noFilter = filter.length === 0;
    let data = [];
    if (
      (noFilter || filter.includes("artists")) &&
      starredData?.starred2?.artist
    ) {
      data.push(starredData.starred2.artist);
    }
    if (noFilter || filter.includes("albums")) {
      data.push(mergeOffline(starredData?.starred2?.album ?? [], "album"));
    }
    if (noFilter || filter.includes("playlists")) {
      if (filter.includes("playlists") && hasServerData) {
        data.push(favoritesItem);
      }
      data.push(
        mergeOffline(playlistsData?.playlists?.playlist ?? [], "playlist"),
      );
    }
    if (showPodcasts && (noFilter || filter.includes("podcasts"))) {
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
    if (noFilter || filter.includes("radioStations")) {
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
    if (
      (noFilter || filter.includes("folders")) &&
      musicFoldersData?.musicFolders?.musicFolder
    ) {
      data.push(
        musicFoldersData.musicFolders.musicFolder.map((f) => ({
          id: String(f.id),
          name: f.name ?? `Library ${f.id}`,
          isFolder: true,
        })),
      );
    }
    data = data.flat();
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
    const sorted = data.sort((a, b) => {
      if (sort === "addedAtAsc") {
        return sortTime(a) - sortTime(b);
      }
      if (sort === "addedAtDesc") {
        return sortTime(b) - sortTime(a);
      }
      if (sort === "alphabeticalAsc") {
        return a.name.localeCompare(b.name);
      }
      if (sort === "alphabeticalDesc") {
        return b.name.localeCompare(a.name);
      }
      return 0;
    });
    // Pin Favorites + the "all albums/artists" browse entries at the top of the
    // unfiltered library so the sort never scatters them into the list.
    if (noFilter && hasServerData) {
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
  ]);

  const isLoading = isLoadingPlaylists || isLoadingStarred;
  const error = playlistsError || starredError;

  // Changing the sort or filter swaps the list contents; without this the
  // FlashList keeps its old offset and can land mid-list or at the bottom. Reset
  // to the top so the new ordering / filtered set starts in view.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [sort, filter]);

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
              horizontal
              showsHorizontalScrollIndicator={false}
              className="gap-x-4"
              contentContainerStyle={{ paddingHorizontal: 24 }}
            >
              <FadeOutScaleDown onPress={() => handleFilterPress("playlists")}>
                <Badge
                  className={cn("rounded-full bg-gray-800 px-4 py-1 mr-2", {
                    "bg-emerald-500 text-primary-800":
                      filter.includes("playlists"),
                  })}
                >
                  <BadgeText className="normal-case text-md text-white">
                    {t("app.shared.playlist_other")}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={() => handleFilterPress("albums")}>
                <Badge
                  className={cn("rounded-full bg-gray-800 px-4 py-1 mr-2", {
                    "bg-emerald-500 text-primary-800":
                      filter.includes("albums"),
                  })}
                >
                  <BadgeText className="normal-case text-md text-white">
                    {t("app.shared.album_other")}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={() => handleFilterPress("artists")}>
                <Badge
                  className={cn("rounded-full bg-gray-800 px-4 py-1 mr-2", {
                    "bg-emerald-500 text-primary-800":
                      filter.includes("artists"),
                    "mr-2": showPodcasts,
                  })}
                >
                  <BadgeText className="normal-case text-md text-white">
                    {t("app.shared.artist_other")}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
              {showPodcasts && (
                <FadeOutScaleDown onPress={() => handleFilterPress("podcasts")}>
                  <Badge
                    className={cn("rounded-full bg-gray-800 px-4 py-1 mr-2", {
                      "bg-emerald-500 text-primary-800":
                        filter.includes("podcasts"),
                    })}
                  >
                    <BadgeText className="normal-case text-md text-white">
                      {t("app.shared.podcast_other")}
                    </BadgeText>
                  </Badge>
                </FadeOutScaleDown>
              )}
              <FadeOutScaleDown
                onPress={() => handleFilterPress("radioStations")}
              >
                <Badge
                  className={cn("rounded-full bg-gray-800 px-4 py-1 mr-2", {
                    "bg-emerald-500 text-primary-800":
                      filter.includes("radioStations"),
                  })}
                >
                  <BadgeText className="normal-case text-md text-white">
                    {t("app.shared.radioStation_other")}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={() => handleFilterPress("folders")}>
                <Badge
                  className={cn("rounded-full bg-gray-800 px-4 py-1", {
                    "bg-emerald-500 text-primary-800":
                      filter.includes("folders"),
                  })}
                >
                  <BadgeText className="normal-case text-md text-white">
                    {t("app.shared.folder_other")}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
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
              {sort.endsWith("Asc") && <ArrowUp size={16} color={white} />}
              {sort.endsWith("Desc") && <ArrowDown size={16} color={white} />}
              {!sort.endsWith("Asc") && !sort.endsWith("Desc") && (
                <ArrowDownUp size={16} color={white} />
              )}
              <Text className="text-white font-bold">
                {sort.startsWith("addedAt")
                  ? t("app.library.recentSort")
                  : t("app.library.alphabeticalSort")}
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
          ListEmptyComponent={() => (isLoading ? null : <EmptyDisplay />)}
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
      <AddBottomSheet
        ref={bottomSheetModalRef}
        onChange={handleSheetPositionChange}
      />
      <CenteredBottomSheetModal
        ref={bottomSheetModalSortRef}
        onChange={handleSheetPositionChangeSort}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
      >
        <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
          <Box className="p-6 w-full mb-12">
            <VStack className="mt-6 gap-y-8">
              <FadeOutScaleDown
                onPress={() =>
                  handleSortPress(
                    sort === "addedAtAsc" ? "addedAtDesc" : "addedAtAsc",
                  )
                }
              >
                <HStack className="items-center justify-between">
                  <VStack className="ml-4">
                    <Text className="text-lg text-gray-200">
                      {t("app.library.recentSort")}
                    </Text>
                  </VStack>
                  {sort === "addedAtAsc" && (
                    <ArrowUp size={24} color={emerald500} />
                  )}
                  {sort === "addedAtDesc" && (
                    <ArrowDown size={24} color={emerald500} />
                  )}
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() =>
                  handleSortPress(
                    sort === "alphabeticalAsc"
                      ? "alphabeticalDesc"
                      : "alphabeticalAsc",
                  )
                }
              >
                <HStack className="items-center justify-between">
                  <VStack className="ml-4">
                    <Text className="text-lg text-gray-200">
                      {t("app.library.alphabeticalSort")}
                    </Text>
                  </VStack>
                  {sort === "alphabeticalAsc" && (
                    <ArrowUp size={24} color={emerald500} />
                  )}
                  {sort === "alphabeticalDesc" && (
                    <ArrowDown size={24} color={emerald500} />
                  )}
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
    </Box>
  );
}
