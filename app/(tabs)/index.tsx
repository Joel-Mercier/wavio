import ErrorDisplay from "@/components/ErrorDisplay";
import AlbumListItem from "@/components/albums/AlbumListItem";
import ArtistListItem from "@/components/artists/ArtistListItem";
import HomeDrawer from "@/components/home/HomeDrawer";
import HomeShortcut from "@/components/home/HomeShortcut";
import PlaylistListItem from "@/components/playlists/PlaylistListItem";
import TrackListItem from "@/components/tracks/TrackListItem";
import {
  Avatar,
  AvatarFallbackText,
  AvatarImage,
} from "@/components/ui/avatar";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { VStack } from "@/components/ui/vstack";
import {
  useMusicDirectory,
  useMusicFolders,
} from "@/hooks/openSubsonic/useBrowsing";
import { useAlbumList2 } from "@/hooks/openSubsonic/useLists";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import TrackPlayer from "@weights-ai/react-native-track-player";
import { useEffect, useState } from "react";

export default function HomeScreen() {
  const [showDrawer, setShowDrawer] = useState<boolean>(false);
  const tabBarHeight = useBottomTabBarHeight();
  const {
    data: recentData,
    isLoading: isLoadingRecent,
    error: recentError,
  } = useAlbumList2({ type: "newest", size: 12 });
  const {
    data: mostPlayedData,
    isLoading: isLoadingMostPlayed,
    error: mostPlayedError,
  } = useAlbumList2({ type: "frequent", size: 12 });
  const {
    data: highestRatedData,
    isLoading: isLoadingHighestRated,
    error: highestRatedError,
  } = useAlbumList2({ type: "highest", size: 12 });
  const handleClose = () => setShowDrawer(false);
  useEffect(() => {
    TrackPlayer.add([
      {
        url: "https://s3.amazonaws.com/citizen-dj-assets.labs.loc.gov/audio/items/loc-fma/fma-184032.mp3",
        title: "Test",
        artist: "Test",
        artwork: "https://picsum.photos/200",
        duration: 159,
      },
    ]);
  }, []);

  return (
    <>
      <SafeAreaView>
        <ScrollView contentContainerStyle={{ paddingBottom: tabBarHeight }}>
          <Box className="px-6 mt-6 mb-4">
            <HStack className="gap-x-4 items-center mb-4">
              <Pressable onPress={() => setShowDrawer(true)}>
                <Avatar size="sm" className="border-emerald-500 border-2">
                  <AvatarFallbackText className="font-body ">
                    {process.env.EXPO_PUBLIC_NAVIDROME_USERNAME || ""}
                  </AvatarFallbackText>
                </Avatar>
              </Pressable>
              <Heading size="2xl" className="text-white font-bold">
                Hi {process.env.EXPO_PUBLIC_NAVIDROME_USERNAME || ""}
              </Heading>
            </HStack>
            <VStack className="gap-y-4">
              <HStack className="gap-x-4">
                <HomeShortcut />
                <HomeShortcut />
              </HStack>
              <HStack className="gap-x-4">
                <HomeShortcut />
                <HomeShortcut />
              </HStack>
              <HStack className="gap-x-4">
                <HomeShortcut />
                <HomeShortcut />
              </HStack>
              <HStack className="gap-x-4">
                <HomeShortcut />
                <HomeShortcut />
              </HStack>
            </VStack>
          </Box>
          <Box className="px-6 mt-4 mb-4">
            <Heading size="xl" className="text-white">
              Recently added
            </Heading>
          </Box>
          {recentError ? (
            <ErrorDisplay error={recentError} />
          ) : (
            <>
              {isLoadingRecent ? (
                <Spinner size="large" />
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="pl-6 mb-6"
                >
                  {recentData?.albumList2?.album?.map((album, index) => (
                    <AlbumListItem
                      key={album.id}
                      album={album}
                      index={index}
                      layout="horizontal"
                    />
                  ))}
                </ScrollView>
              )}
            </>
          )}
          <Box className="px-6 mt-4 mb-4">
            <Heading size="xl" className="text-white">
              Most played
            </Heading>
          </Box>
          {mostPlayedError ? (
            <ErrorDisplay error={mostPlayedError} />
          ) : (
            <>
              {isLoadingMostPlayed ? (
                <Spinner size="large" />
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="pl-6 mb-6"
                >
                  {mostPlayedData?.albumList2?.album?.map((album, index) => (
                    <AlbumListItem
                      key={album.id}
                      album={album}
                      index={index}
                      layout="horizontal"
                    />
                  ))}
                </ScrollView>
              )}
            </>
          )}
          <Box className="px-6 mt-4 mb-4">
            <Heading size="xl" className="text-white">
              Top rated
            </Heading>
          </Box>
          {highestRatedError ? (
            <ErrorDisplay error={highestRatedError} />
          ) : (
            <>
              {isLoadingHighestRated ? (
                <Spinner size="large" />
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="pl-6 mb-6"
                >
                  {highestRatedData?.albumList2?.album?.map((album, index) => (
                    <AlbumListItem
                      key={album.id}
                      album={album}
                      index={index}
                      layout="horizontal"
                    />
                  ))}
                </ScrollView>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
      <HomeDrawer onClose={handleClose} showDrawer={showDrawer} />
    </>
  );
}
