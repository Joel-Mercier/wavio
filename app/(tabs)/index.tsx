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
import { VStack } from "@/components/ui/vstack";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import TrackPlayer from "@weights-ai/react-native-track-player";
import { useEffect, useState } from "react";

export default function HomeScreen() {
  const [showDrawer, setShowDrawer] = useState<boolean>(false);
  const tabBarHeight = useBottomTabBarHeight();

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
                <Avatar size="sm" className="">
                  <AvatarFallbackText className="font-body">
                    Joel
                  </AvatarFallbackText>
                  <AvatarImage
                    source={require("@/assets/images/covers/gunship-unicorn.jpg")}
                  />
                </Avatar>
              </Pressable>
              <Heading size="2xl" className="text-white font-bold">
                Hi joel
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="pl-6 mb-6"
          >
            <AlbumListItem />
            <ArtistListItem />
            <PlaylistListItem />
            <AlbumListItem />
            <AlbumListItem />
            <AlbumListItem />
          </ScrollView>
          <Box className="px-6 mt-4 mb-4">
            <Heading size="xl" className="text-white">
              Recently played
            </Heading>
          </Box>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="pl-6 mb-6"
          >
            <AlbumListItem />
            <ArtistListItem />
            <PlaylistListItem />
            <AlbumListItem />
            <AlbumListItem />
            <AlbumListItem />
          </ScrollView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="pl-6 mb-6"
          >
            <AlbumListItem />
            <ArtistListItem />
            <PlaylistListItem />
            <AlbumListItem />
            <AlbumListItem />
            <AlbumListItem />
          </ScrollView>
          <Box className="px-6 mt-4 mb-4">
            <Heading size="xl" className="text-white">
              Most played
            </Heading>
          </Box>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="pl-6 mb-6"
          >
            <AlbumListItem />
            <ArtistListItem />
            <PlaylistListItem />
            <AlbumListItem />
            <AlbumListItem />
            <AlbumListItem />
          </ScrollView>
        </ScrollView>
      </SafeAreaView>
      <HomeDrawer onClose={handleClose} showDrawer={showDrawer} />
    </>
  );
}
