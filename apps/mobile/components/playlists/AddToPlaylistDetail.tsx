import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import AddToPlaylistListItem from "@/components/playlists/AddToPlaylistListItem";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { usePlaylists, useUpdatePlaylist } from "@/hooks/backend/usePlaylists";
import { getPlaylist } from "@/services/backend/playlists";
import { logError } from "@/utils/log";
import { goBackOrHome } from "@/utils/navigation";

export default function AddToPlaylistDetail() {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { ids } = useLocalSearchParams<{ ids: string }>();
  const trackIds = ids?.split(",");
  const [selectedPlaylists, setSelectedPlaylists] = useState<string[]>([]);
  const [playlistTrackIds, setPlaylistTrackIds] = useState<
    Record<string, string[]>
  >({});
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicatePlaylistNames, setDuplicatePlaylistNames] = useState<
    string[]
  >([]);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error } = usePlaylists({});
  const doUpdatePlaylist = useUpdatePlaylist();

  const handleNewPlaylistPress = () => {
    router.navigate({
      pathname: "/playlists/new",
      params: { returnTo: "add-to-playlist" },
    });
  };

  const addToSelectedPlaylists = () => {
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
            goBackOrHome(router);
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
            logError(error);
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
  };

  const handlePlaylistUpdatePress = () => {
    if (selectedPlaylists.length === 0) {
      goBackOrHome(router);
      return;
    }
    const duplicateNames = selectedPlaylists
      .filter((playlistId) =>
        trackIds.some((trackId) =>
          playlistTrackIds[playlistId]?.includes(trackId),
        ),
      )
      .map(
        (playlistId) =>
          data?.playlists.playlist?.find(
            (playlist) => playlist.id === playlistId,
          )?.name ?? "",
      )
      .filter((name) => name.length > 0);

    if (duplicateNames.length === 0) {
      addToSelectedPlaylists();
    } else {
      setDuplicatePlaylistNames(duplicateNames);
      setShowDuplicateDialog(true);
    }
  };

  const handleCloseDuplicateDialog = () => {
    setShowDuplicateDialog(false);
  };

  const handleConfirmAddDuplicates = () => {
    setShowDuplicateDialog(false);
    addToSelectedPlaylists();
  };

  const handlePlaylistPress = (id: string) => {
    if (selectedPlaylists.includes(id)) {
      setSelectedPlaylists(
        selectedPlaylists.filter((playlistId) => playlistId !== id),
      );
    } else {
      setSelectedPlaylists([...selectedPlaylists, id]);
      if (!playlistTrackIds[id]) {
        queryClient
          .fetchQuery({
            queryKey: ["playlist", id],
            queryFn: () => getPlaylist(id),
          })
          .then((playlistData) => {
            setPlaylistTrackIds((current) => ({
              ...current,
              [id]: playlistData.playlist.entry?.map((entry) => entry.id) ?? [],
            }));
          })
          .catch((error) => {
            logError(error);
            setPlaylistTrackIds((current) => ({ ...current, [id]: [] }));
          });
      }
    }
  };

  // FloatingPlayer sits at bottom: 96 and is FLOATING_PLAYER_HEIGHT tall,
  // so its top edge is this far from the bottom of the screen.
  const floatingPlayerTop = 96 + FLOATING_PLAYER_HEIGHT;

  const playlists = data?.playlists.playlist;

  return (
    <Box className="h-full flex-1">
      <Box className="px-6 pb-6">
        <HStack
          className="items-center justify-between"
          style={{ paddingTop: insets.top + 16 }}
        >
          <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
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
        data={playlists}
        contentContainerStyle={{
          paddingBottom: floatingPlayerTop + 96,
        }}
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
      <LinearGradient
        pointerEvents="box-none"
        colors={["transparent", "#000000"]}
        locations={[0, 0.6]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: floatingPlayerTop + 160,
          justifyContent: "flex-end",
        }}
      >
        <Center style={{ marginBottom: floatingPlayerTop + 16 }}>
          <FadeOutScaleDown
            className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
            onPress={handlePlaylistUpdatePress}
          >
            <Text className="text-primary-800 font-bold text-lg">
              {t("app.playlists.finished")}
            </Text>
          </FadeOutScaleDown>
        </Center>
      </LinearGradient>
      <AlertDialog
        isOpen={showDuplicateDialog}
        onClose={handleCloseDuplicateDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.playlists.duplicateTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t("app.playlists.duplicateDescription", {
                count: trackIds.length,
                playlists: duplicatePlaylistNames.join(", "),
              })}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="flex-col items-stretch justify-center">
            <FadeOutScaleDown
              onPress={handleConfirmAddDuplicates}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full mb-3"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.playlists.addAnyway")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleCloseDuplicateDialog}
              className="items-center justify-center py-3 px-8 border border-white rounded-full"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}
