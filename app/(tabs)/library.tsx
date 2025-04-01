import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import LibraryListItem, {
  type Favorites,
} from "@/components/library/LibraryListItem";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useStarred2 } from "@/hooks/openSubsonic/useLists";
import { usePlaylists } from "@/hooks/openSubsonic/usePlaylists";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import type {
  AlbumID3,
  ArtistID3,
  Playlist,
} from "@/services/openSubsonic/types";
import { cn } from "@/utils/tailwind";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import {
  ArrowDownUp,
  LayoutGrid,
  List,
  ListMusic,
  Plus,
  Search,
} from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import type { LayoutChangeEvent } from "react-native";

export type LibraryLayout = "list" | "grid";

export default function LibraryScreen() {
  const router = useRouter();
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  const [layout, setLayout] = useState<LibraryLayout>("list");
  const [filter, setFilter] = useState<
    "artists" | "albums" | "playlists" | null
  >(null);
  const tabBarHeight = useBottomTabBarHeight();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const {
    data: starredData,
    isLoading: isLoadingStarred,
    isFetching: isFetchingStarred,
    error: starredError,
    refetch: refetchStarred,
  } = useStarred2({});
  const {
    data: playlistsData,
    isLoading: isLoadingPlaylists,
    isFetching: isFetchingPlaylists,
    error: playlistsError,
    refetch: refetchPlaylists,
  } = usePlaylists({});

  const handleHeaderLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setHeaderHeight(height);
  };

  const handleLayoutPress = () => {
    setLayout(layout === "list" ? "grid" : "list");
  };

  const handleFilterPress = (type: "artists" | "albums" | "playlists") => {
    setFilter(type === filter ? null : type);
  };

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleCreatePlaylistPress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.navigate("playlists/new");
  };

  const data = useMemo(() => {
    if (
      !starredData ||
      !starredData?.starred2 ||
      !playlistsData ||
      !playlistsData?.playlists
    ) {
      return [];
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
    data = data.flat();
    return data.sort((a, b) => {
      return (
        new Date(b.starred || b.created) - new Date(a.starred || a.created)
      );
    });
  }, [starredData, playlistsData, filter]);

  return (
    <SafeAreaView className="h-full">
      <FlashList
        data={data}
        keyExtractor={(item) => item.id}
        numColumns={layout === "grid" ? 3 : 1}
        refreshing={
          (isFetchingStarred && !isLoadingStarred) ||
          (isFetchingPlaylists && !isLoadingPlaylists)
        }
        onRefresh={() => {
          refetchPlaylists();
          refetchStarred();
        }}
        renderItem={({
          item,
          index,
          target,
          extraData,
        }: {
          item: Playlist & AlbumID3 & ArtistID3 & Favorites;
          index: number;
          target: string;
          extraData: { layout: LibraryLayout };
        }) => {
          return (
            <LibraryListItem
              item={item}
              layout={extraData.layout}
              key={item.id}
              index={index}
            />
          );
        }}
        extraData={{ layout }}
        estimatedItemSize={70}
        ListHeaderComponent={() => (
          <>
            <Box onLayout={handleHeaderLayout}>
              <HStack className="mt-6 items-center justify-between">
                <Heading className="text-white" size="2xl">
                  Library
                </Heading>
                <HStack className="items-center gap-x-4">
                  <FadeOutScaleDown>
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
                <FadeOutScaleDown
                  onPress={() => handleFilterPress("playlists")}
                >
                  <Badge
                    className={cn("rounded-full bg-gray-800 px-4 py-1 mr-2", {
                      "bg-emerald-500 text-primary-800": filter === "playlists",
                    })}
                  >
                    <BadgeText className="normal-case text-md text-white">
                      Playlists
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
                      Albums
                    </BadgeText>
                  </Badge>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={() => handleFilterPress("artists")}>
                  <Badge
                    className={cn("rounded-full bg-gray-800 px-4 py-1", {
                      "bg-emerald-500 text-primary-800": filter === "artists",
                    })}
                  >
                    <BadgeText className="normal-case text-md text-white">
                      Artists
                    </BadgeText>
                  </Badge>
                </FadeOutScaleDown>
              </ScrollView>
            </Box>
            <HStack className="pb-6 items-center justify-between">
              <FadeOutScaleDown>
                <HStack className="items-center gap-x-2">
                  <ArrowDownUp
                    size={16}
                    color={themeConfig.theme.colors.white}
                  />
                  <Text className="text-white font-bold">Recent</Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={handleLayoutPress}>
                {layout === "list" ? (
                  <LayoutGrid
                    size={16}
                    color={themeConfig.theme.colors.white}
                  />
                ) : (
                  <List size={16} color={themeConfig.theme.colors.white} />
                )}
              </FadeOutScaleDown>
            </HStack>
            {(isLoadingPlaylists || isLoadingStarred) && (
              <Spinner size="large" />
            )}
            {(playlistsError || starredError) && (
              <ErrorDisplay error={playlistsError || starredError} />
            )}
          </>
        )}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: tabBarHeight + headerHeight + 16,
        }}
      />
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
          <Box className="p-6 w-full pb-12">
            <VStack className="mt-6 gap-y-8">
              <FadeOutScaleDown onPress={handleCreatePlaylistPress}>
                <HStack className="items-center">
                  <ListMusic
                    size={32}
                    color={themeConfig.theme.colors.gray[200]}
                  />
                  <VStack className="ml-4">
                    <Heading className="text-white">Playlist</Heading>
                    <Text className="text-md text-gray-200">
                      Create a playlist with songs or podcast episodes
                    </Text>
                  </VStack>
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
