import LibraryListItem from "@/components/library/LibraryListItem";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
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
    if (!filter || filter === "artists") {
      data.push(starredData.starred2.artist);
    }
    if (!filter || filter === "albums") {
      data.push(starredData.starred2.album);
    }
    if (!filter || filter === "playlists") {
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
          item: Playlist & AlbumID3 & ArtistID3;
          index: number;
          target: string;
          extraData: { layout: LibraryLayout };
        }) => {
          return (
            <LibraryListItem
              item={item}
              layout={extraData.layout}
              key={item.id}
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
                  <Pressable>
                    {({ pressed }) => (
                      <Search color={themeConfig.theme.colors.white} />
                    )}
                  </Pressable>
                  <Pressable>
                    {({ pressed }) => (
                      <Plus color={themeConfig.theme.colors.white} />
                    )}
                  </Pressable>
                </HStack>
              </HStack>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="gap-x-4 my-6"
              >
                <Pressable onPress={() => handleFilterPress("playlists")}>
                  {({ pressed }) => (
                    <Badge
                      className={cn("rounded-full bg-gray-800 px-4 py-1", {
                        "bg-emerald-500 text-primary-800":
                          filter === "playlists",
                      })}
                    >
                      <BadgeText className="normal-case text-md text-white">
                        Playlists
                      </BadgeText>
                    </Badge>
                  )}
                </Pressable>
                <Pressable onPress={() => handleFilterPress("albums")}>
                  {({ pressed }) => (
                    <Badge
                      className={cn("rounded-full bg-gray-800 px-4 py-1", {
                        "bg-emerald-500 text-primary-800": filter === "albums",
                      })}
                    >
                      <BadgeText className="normal-case text-md text-white">
                        Albums
                      </BadgeText>
                    </Badge>
                  )}
                </Pressable>
                <Pressable onPress={() => handleFilterPress("artists")}>
                  {({ pressed }) => (
                    <Badge
                      className={cn("rounded-full bg-gray-800 px-4 py-1", {
                        "bg-emerald-500 text-primary-800": filter === "artists",
                      })}
                    >
                      <BadgeText className="normal-case text-md text-white">
                        Artists
                      </BadgeText>
                    </Badge>
                  )}
                </Pressable>
              </ScrollView>
            </Box>
            <HStack className="pb-6 items-center justify-between">
              <Pressable>
                {({ pressed }) => (
                  <HStack className="items-center gap-x-2">
                    <ArrowDownUp
                      size={16}
                      color={themeConfig.theme.colors.white}
                    />
                    <Text className="text-white font-bold">Recent</Text>
                  </HStack>
                )}
              </Pressable>
              <Pressable onPress={handleLayoutPress}>
                {({ pressed }) => {
                  return layout === "list" ? (
                    <LayoutGrid
                      size={16}
                      color={themeConfig.theme.colors.white}
                    />
                  ) : (
                    <List size={16} color={themeConfig.theme.colors.white} />
                  );
                }}
              </Pressable>
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
