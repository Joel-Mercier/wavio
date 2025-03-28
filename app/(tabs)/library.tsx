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
import { Text } from "@/components/ui/text";
import { themeConfig } from "@/config/theme";
import { useStarred2 } from "@/hooks/openSubsonic/useLists";
import { usePlaylists } from "@/hooks/openSubsonic/usePlaylists";
import type {
  AlbumID3,
  ArtistID3,
  Playlist,
} from "@/services/openSubsonic/types";
import { cn } from "@/utils/tailwind";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import {
  ArrowDownUp,
  LayoutGrid,
  List,
  Plus,
  Search,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import type { LayoutChangeEvent } from "react-native";

export type LibraryLayout = "list" | "grid";

export default function LibraryScreen() {
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  const [layout, setLayout] = useState<LibraryLayout>("list");
  const [filter, setFilter] = useState<
    "artists" | "albums" | "playlists" | null
  >(null);
  const tabBarHeight = useBottomTabBarHeight();
  const {
    data: starredData,
    isLoading: isLoadingStarred,
    error: starredError,
  } = useStarred2({});
  const {
    data: playlistsData,
    isLoading: isLoadingPlaylists,
    error: playlistsError,
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
    if (!filter || filter === "artists") {
      data.push(starredData.starred2.artist);
    }
    if (!filter || filter === "albums") {
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
      data.push(playlistsData.playlists.playlist);
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
                  <FadeOutScaleDown>
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
          </>
        )}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: tabBarHeight + headerHeight + 16,
        }}
      />
    </SafeAreaView>
  );
}
