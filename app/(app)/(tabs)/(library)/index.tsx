import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  LayoutGrid,
  List,
  ListMusic,
  Plus,
  Radio,
  Search,
} from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import LibraryListItem, {
  type Favorites,
  type LibraryFolder,
  type LibraryPodcast,
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
import { themeConfig } from "@/config/theme";
import { useMusicFolders } from "@/hooks/openSubsonic/useBrowsing";
import { useStarred2 } from "@/hooks/openSubsonic/useLists";
import { usePlaylists } from "@/hooks/openSubsonic/usePlaylists";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import type {
  AlbumID3,
  ArtistID3,
  Playlist,
} from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import useAuth from "@/stores/auth";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import usePodcasts from "@/stores/podcasts";
import { loadingData } from "@/utils/loadingData";
import { cn } from "@/utils/tailwind";

export type LibraryLayout = "list" | "grid";

export default function LibraryScreen() {
  const { t } = useTranslation();
  const setShowDrawer = useApp((store) => store.setShowDrawer);
  const username = useAuth((store) => store.username);
  const router = useRouter();
  const sort = useApp((store) => store.librarySort);
  const setSort = useApp((store) => store.setLibrarySort);
  const [layout, setLayout] = useState<LibraryLayout>("list");
  const filter = useApp((store) => store.libraryFilter);
  const setFilter = useApp((store) => store.setLibraryFilter);
  const taddyPodcastsApiKey = usePodcasts((store) => store.taddyPodcastsApiKey);
  const taddyPodcastsUserId = usePodcasts((store) => store.taddyPodcastsUserId);
  const favoritePodcasts = usePodcasts((store) => store.favoritePodcasts);
  const podcastsEnabled = Boolean(taddyPodcastsApiKey && taddyPodcastsUserId);
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetModalSortRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const { handleSheetPositionChange: handleSheetPositionChangeSort } =
    useBottomSheetBackHandler(bottomSheetModalSortRef);
  const musicFolderId = useCurrentMusicFolderId();
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

  const handleLayoutPress = () => {
    setLayout(layout === "list" ? "grid" : "list");
  };

  const handleFilterPress = (
    type: "artists" | "albums" | "playlists" | "podcasts" | "folders",
  ) => {
    setFilter(type === filter ? null : type);
  };

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handlePresentSortModalPress = useCallback(() => {
    bottomSheetModalSortRef.current?.present();
  }, []);

  const handleCreatePlaylistPress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.navigate("/playlists/new");
  };

  const handleCreateInternetRadioStationPress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.navigate("/internet-radio-stations/new");
  };

  const handleSortPress = (type: typeof sort) => {
    bottomSheetModalSortRef.current?.dismiss();
    setSort(type);
  };

  const handleSearchPress = () => {
    router.navigate("/(app)/(tabs)/(library)/search");
  };

  const data = useMemo(() => {
    if (
      !starredData ||
      !starredData?.starred2 ||
      !playlistsData ||
      !playlistsData?.playlists
    ) {
      return null;
    }
    let data = [];
    if (!filter) {
      data.push({
        id: "favorites",
        name: "Favorites",
        isFavorites: true,
        songCount: starredData?.starred2.song?.length || 0,
      });
    }
    if ((!filter || filter === "artists") && starredData.starred2.artist) {
      data.push(starredData.starred2.artist);
    }
    if ((!filter || filter === "albums") && starredData.starred2.album) {
      data.push(starredData.starred2.album);
    }
    if (!filter || filter === "playlists") {
      if (filter === "playlists") {
        data.push({
          id: "favorites",
          name: "Favorites",
          isFavorites: true,
          songCount: starredData?.starred2.song?.length || 0,
        });
      }
      if (playlistsData.playlists.playlist) {
        data.push(playlistsData.playlists.playlist);
      }
    }
    if (podcastsEnabled && (!filter || filter === "podcasts")) {
      data.push(
        favoritePodcasts.map((p) => ({
          id: p.uuid,
          name: p.name,
          isPodcast: true,
          imageUrl: p.imageUrl,
          authorName: p.authorName,
          dateAdded: p.dateAdded,
        })),
      );
    }
    if (
      (!filter || filter === "folders") &&
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
    return data.sort((a, b) => {
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
  }, [
    starredData,
    playlistsData,
    filter,
    sort,
    podcastsEnabled,
    favoritePodcasts,
    musicFoldersData,
  ]);

  const isLoading = isLoadingPlaylists || isLoadingStarred;
  const error = playlistsError || starredError;

  return (
    <Box className="h-full">
      <>
        <Box className="px-6" style={{ paddingTop: insets.top }}>
          <HStack className="mt-6 items-center justify-between">
            <HStack className="items-center gap-x-4">
              <FadeOutScaleDown onPress={() => setShowDrawer(true)}>
                <Avatar size="sm" className="border-emerald-500 border-2">
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
              <FadeOutScaleDown onPress={handleSearchPress}>
                <Search color={themeConfig.theme.colors.white} />
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={handlePresentModalPress}>
                <Plus color={themeConfig.theme.colors.white} />
              </FadeOutScaleDown>
            </HStack>
          </HStack>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="gap-x-4 my-6"
          >
            <FadeOutScaleDown onPress={() => handleFilterPress("playlists")}>
              <Badge
                className={cn("rounded-full bg-gray-800 px-4 py-1 mr-2", {
                  "bg-emerald-500 text-primary-800": filter === "playlists",
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
                  "bg-emerald-500 text-primary-800": filter === "albums",
                })}
              >
                <BadgeText className="normal-case text-md text-white">
                  {t("app.shared.album_other")}
                </BadgeText>
              </Badge>
            </FadeOutScaleDown>
            <FadeOutScaleDown onPress={() => handleFilterPress("artists")}>
              <Badge
                className={cn("rounded-full bg-gray-800 px-4 py-1", {
                  "bg-emerald-500 text-primary-800": filter === "artists",
                  "mr-2": podcastsEnabled,
                })}
              >
                <BadgeText className="normal-case text-md text-white">
                  {t("app.shared.artist_other")}
                </BadgeText>
              </Badge>
            </FadeOutScaleDown>
            {podcastsEnabled && (
              <FadeOutScaleDown onPress={() => handleFilterPress("podcasts")}>
                <Badge
                  className={cn("rounded-full bg-gray-800 px-4 py-1 mr-2", {
                    "bg-emerald-500 text-primary-800": filter === "podcasts",
                  })}
                >
                  <BadgeText className="normal-case text-md text-white">
                    {t("app.shared.podcast_other")}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
            )}
            <FadeOutScaleDown onPress={() => handleFilterPress("folders")}>
              <Badge
                className={cn("rounded-full bg-gray-800 px-4 py-1", {
                  "bg-emerald-500 text-primary-800": filter === "folders",
                })}
              >
                <BadgeText className="normal-case text-md text-white">
                  {t("app.shared.folder_other")}
                </BadgeText>
              </Badge>
            </FadeOutScaleDown>
          </ScrollView>
        </Box>
        <HStack className="px-6 pb-4 items-center justify-between">
          <FadeOutScaleDown onPress={handlePresentSortModalPress}>
            <HStack className="items-center gap-x-2">
              {sort.endsWith("Asc") && (
                <ArrowUp size={16} color={themeConfig.theme.colors.white} />
              )}
              {sort.endsWith("Desc") && (
                <ArrowDown size={16} color={themeConfig.theme.colors.white} />
              )}
              {!sort.endsWith("Asc") && !sort.endsWith("Desc") && (
                <ArrowDownUp size={16} color={themeConfig.theme.colors.white} />
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
              <LayoutGrid size={16} color={themeConfig.theme.colors.white} />
            ) : (
              <List size={16} color={themeConfig.theme.colors.white} />
            )}
          </FadeOutScaleDown>
        </HStack>
        {/* {(isLoadingPlaylists || isLoadingStarred) && <Spinner size="large" />} */}
        {error && <ErrorDisplay error={error} />}
      </>
      {!error && (
        <FlashList
          key={`library-${layout}`}
          data={
            (data || loadingData(16)) as Array<
              Playlist &
                AlbumID3 &
                ArtistID3 &
                Favorites &
                LibraryPodcast &
                LibraryFolder
            >
          }
          keyExtractor={(item) => item.id}
          numColumns={layout === "grid" ? 3 : 1}
          refreshing={
            (isFetchingStarred && !isLoadingStarred) ||
            (isFetchingPlaylists && !isLoadingPlaylists) ||
            isFetchingMusicFolders
          }
          onRefresh={() => {
            refetchPlaylists();
            refetchStarred();
            refetchMusicFolders();
          }}
          renderItem={({ item, index, extraData }) => {
            const { layout: itemLayout } = extraData as {
              layout: LibraryLayout;
            };
            return isLoading ? (
              <LibraryListItemSkeleton layout={itemLayout} index={index} />
            ) : (
              <LibraryListItem
                item={item}
                layout={itemLayout}
                key={item.id}
                index={index}
              />
            );
          }}
          extraData={{ layout }}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: tabBarHeight + FLOATING_PLAYER_HEIGHT,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}
      <BottomSheetModal
        ref={bottomSheetModalRef}
        onChange={handleSheetPositionChange}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView
          style={{
            flex: 1,
            alignItems: "center",
          }}
        >
          <Box className="p-6 w-full mb-12">
            <VStack className="mt-6 gap-y-8">
              <FadeOutScaleDown onPress={handleCreatePlaylistPress}>
                <HStack className="items-center">
                  <ListMusic
                    size={32}
                    color={themeConfig.theme.colors.gray[200]}
                  />
                  <VStack className="ml-4">
                    <Heading className="text-white">
                      {t("app.create.playlistTitle")}
                    </Heading>
                    <Text className="text-md text-gray-200">
                      {t("app.create.playlistDescription")}
                    </Text>
                  </VStack>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={handleCreateInternetRadioStationPress}>
                <HStack className="items-center">
                  <Radio size={32} color={themeConfig.theme.colors.gray[200]} />
                  <VStack className="ml-4">
                    <Heading className="text-white">
                      {t("app.create.internetRadioStationTitle")}
                    </Heading>
                    <Text className="text-md text-gray-200">
                      {t("app.create.internetRadioStationDescription")}
                    </Text>
                  </VStack>
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
      <BottomSheetModal
        ref={bottomSheetModalSortRef}
        onChange={handleSheetPositionChangeSort}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView
          style={{
            flex: 1,
            alignItems: "center",
          }}
        >
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
                    <ArrowUp
                      size={24}
                      color={themeConfig.theme.colors.emerald[500]}
                    />
                  )}
                  {sort === "addedAtDesc" && (
                    <ArrowDown
                      size={24}
                      color={themeConfig.theme.colors.emerald[500]}
                    />
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
                    <ArrowUp
                      size={24}
                      color={themeConfig.theme.colors.emerald[500]}
                    />
                  )}
                  {sort === "alphabeticalDesc" && (
                    <ArrowDown
                      size={24}
                      color={themeConfig.theme.colors.emerald[500]}
                    />
                  )}
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
    </Box>
  );
}
