import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import AddToPlaylistListItem from "@/components/playlists/AddToPlaylistListItem";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { VStack } from "@/components/ui/vstack";
import {
  usePlaylists,
  useUpdatePlaylist,
} from "@/hooks/openSubsonic/usePlaylists";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useState } from "react";

export default function AddToPlaylistScreen() {
  const [selectedPlaylists, setSelectedPlaylists] = useState<string[]>([]);
  const router = useRouter();
  const { data, isLoading, error } = usePlaylists({});

  const doUpdatePlaylist = useUpdatePlaylist();

  const handleNewPlaylistPress = () => {
    router.navigate("/playlists/new");
  };

  const handlePlaylistUpdatePress = () => {
    Promise.all([]);
  };

  const handlePlaylistPress = (id: string) => {
    if (selectedPlaylists.includes(id)) {
      setSelectedPlaylists(
        selectedPlaylists.filter((playlistId) => playlistId !== id),
      );
    } else {
      setSelectedPlaylists([...selectedPlaylists, id]);
    }
  };

  return (
    <SafeAreaView className="h-full">
      <FlashList
        data={data?.playlists.playlist}
        renderItem={({ item }) => (
          <AddToPlaylistListItem
            playlist={item}
            selected={selectedPlaylists.includes(item.id)}
            onPress={handlePlaylistPress}
          />
        )}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <VStack className="px-6">
            <FadeOutScaleDown
              onPress={handleNewPlaylistPress}
            ></FadeOutScaleDown>
            {isLoading && <Spinner size="large" />}
            {error && <ErrorDisplay error={error} />}
          </VStack>
        }
      />
    </SafeAreaView>
  );
}
