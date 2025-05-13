import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import AddToPlaylistListItem from "@/components/playlists/AddToPlaylistListItem";
import { Center } from "@/components/ui/center";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import {
  usePlaylists,
  useUpdatePlaylist,
} from "@/hooks/openSubsonic/usePlaylists";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

export default function AddToPlaylistScreen() {
  const queryClient = useQueryClient();
  const { ids } = useLocalSearchParams<{ ids: string }>();
  const trackIds = ids?.split(",");
  const [selectedPlaylists, setSelectedPlaylists] = useState<string[]>([]);
  const router = useRouter();
  const toast = useToast();
  const { data, isLoading, error } = usePlaylists({});

  const doUpdatePlaylist = useUpdatePlaylist();

  const handleNewPlaylistPress = () => {
    router.navigate("/playlists/new");
  };

  const handlePlaylistUpdatePress = () => {
    if (selectedPlaylists.length === 0) {
      router.back();
    } else {
      selectedPlaylists.map((playlistId) => {
        doUpdatePlaylist.mutate(
          {
            id: playlistId,
            songIdToAdd: trackIds,
          },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({
                predicate: (query) =>
                  query.queryKey[0] === "playlist" &&
                  selectedPlaylists.includes(query.queryKey[1] as string),
              });
              queryClient.invalidateQueries({ queryKey: ["playlists"] });
              router.back();
              toast.show({
                placement: "top",
                duration: 3000,
                render: () => (
                  <Toast action="success">
                    <ToastDescription>
                      {trackIds.length > 1 ? "Songs" : "Song"} successfully
                      added to playlist
                    </ToastDescription>
                  </Toast>
                ),
              });
            },
            onError: (error) => {
              console.error(error);
              toast.show({
                placement: "top",
                duration: 3000,
                render: () => (
                  <Toast action="error">
                    <ToastDescription>
                      An error occurred while adding the{" "}
                      {trackIds.length > 1 ? "songs" : "song"} successfully
                      added to playlist to the playlist
                    </ToastDescription>
                  </Toast>
                ),
              });
            },
          },
        );
      });
    }
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
    <SafeAreaView className="h-full" edges={["bottom", "left", "right"]}>
      <FlashList
        data={data?.playlists.playlist}
        renderItem={({ item, extraData }) => (
          <AddToPlaylistListItem
            playlist={item}
            selected={extraData.selectedPlaylists.includes(item.id)}
            onPress={handlePlaylistPress}
          />
        )}
        keyExtractor={(item) => item.id}
        estimatedItemSize={75}
        extraData={{ selectedPlaylists }}
        ListHeaderComponent={
          <VStack className="px-6">
            <Center className="my-6">
              <FadeOutScaleDown
                className="items-center justify-center py-3 px-8 border border-white bg-white rounded-full"
                onPress={handleNewPlaylistPress}
              >
                <Text className="text-primary-800 font-bold text-lg">
                  New playlist
                </Text>
              </FadeOutScaleDown>
            </Center>

            {isLoading && <Spinner size="large" />}
            {error && <ErrorDisplay error={error} />}
          </VStack>
        }
        ListFooterComponent={
          <Center className="absolute -bottom-16 left-0 right-0">
            <FadeOutScaleDown
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
              onPress={handlePlaylistUpdatePress}
            >
              <Text className="text-primary-800 font-bold text-lg">
                Finished
              </Text>
            </FadeOutScaleDown>
          </Center>
        }
      />
    </SafeAreaView>
  );
}
