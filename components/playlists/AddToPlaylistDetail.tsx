import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import AddToPlaylistListItem from "@/components/playlists/AddToPlaylistListItem";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { usePlaylists, useUpdatePlaylist } from "@/hooks/backend/usePlaylists";

export default function AddToPlaylistDetail() {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { ids } = useLocalSearchParams<{ ids: string }>();
  const trackIds = ids?.split(",");
  const [selectedPlaylists, setSelectedPlaylists] = useState<string[]>([]);
  const router = useRouter();
  const toast = useToast();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
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
                      {t("app.playlists.addTrackSuccessMessage", {
                        count: trackIds.length,
                      })}
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
                      {t("app.playlists.addTrackErrorMessage", {
                        count: trackIds.length,
                      })}
                    </ToastDescription>
                  </Toast>
                ),
              });
            },
          },
        );
        return playlistId;
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
    <Box className="h-full flex-1">
      <Box className="px-6 pb-6">
        <HStack
          className="items-center justify-between"
          style={{ paddingTop: insets.top + 16 }}
        >
          <FadeOutScaleDown onPress={() => router.back()}>
            <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
              <X size={24} color={white} />
            </Box>
          </FadeOutScaleDown>
          <Heading
            className="text-white font-bold text-center truncate flex-1"
            size="lg"
          >
            {t("app.playlists.addToPlaylistTitle")}
          </Heading>
          <Box className="w-10" />
        </HStack>
      </Box>
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
        extraData={{ selectedPlaylists }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <VStack className="px-6">
            <Center className="my-6">
              <FadeOutScaleDown
                className="items-center justify-center py-3 px-8 border border-white bg-white rounded-full"
                onPress={handleNewPlaylistPress}
              >
                <Text className="text-primary-800 font-bold text-lg">
                  {t("app.playlists.newPlaylist")}
                </Text>
              </FadeOutScaleDown>
            </Center>

            {isLoading && <Spinner size="large" />}
            {error && <ErrorDisplay error={error} />}
          </VStack>
        }
      />
      <Center
        className="absolute left-0 right-0"
        style={{
          bottom: insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
        }}
      >
        <FadeOutScaleDown
          className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
          onPress={handlePlaylistUpdatePress}
        >
          <Text className="text-primary-800 font-bold text-lg">
            {t("app.playlists.finished")}
          </Text>
        </FadeOutScaleDown>
      </Center>
    </Box>
  );
}
