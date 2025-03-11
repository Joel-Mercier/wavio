import AlbumListItem from "@/components/albums/AlbumListItem";
import ArtistListItem from "@/components/artists/ArtistListItem";
import PlaylistListItem from "@/components/playlists/PlaylistListItem";
import TrackListItem from "@/components/tracks/TrackListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import TrackPlayer from "@weights-ai/react-native-track-player";
import { useEffect } from "react";

export default function HomeScreen() {
  const tabBarHeight = useBottomTabBarHeight();

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
    <SafeAreaView>
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarHeight }}>
        <Box className="px-6 mb-4">
          <Heading size="xl" className="text-white">
            Recent additions
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
        <Box className="px-6 mb-4 gap-y-4">
          <TrackListItem />
          <TrackListItem />
          <TrackListItem />
          <TrackListItem />
          <TrackListItem />
          <TrackListItem />
          <TrackListItem />
          <TrackListItem />
          <TrackListItem />
          <TrackListItem />
          <TrackListItem />
          <TrackListItem />
          <TrackListItem />
          <TrackListItem />
          <TrackListItem />
          <TrackListItem />
          <TrackListItem />
        </Box>
      </ScrollView>
    </SafeAreaView>
  );
}
