import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import TrackListItem from "@/components/tracks/TrackListItem";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import {
  useDeletePlaylist,
  usePlaylist,
  useUpdatePlaylist,
} from "@/hooks/openSubsonic/usePlaylists";
import { useCreateShare } from "@/hooks/openSubsonic/useSharing";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useImageColors from "@/hooks/useImageColors";
import type { Child } from "@/services/openSubsonic/types";
import useRecentPlays from "@/stores/recentPlays";
import { artworkUrl } from "@/utils/artwork";
import { loadingData } from "@/utils/loadingData";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Clock,
  EllipsisVertical,
  ListMusic,
  Pencil,
  Play,
  Share2,
  Shuffle,
  X,
} from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FLOATING_PLAYER_HEIGHT } from "../FloatingPlayer";
import TrackListItemSkeleton from "../tracks/TrackListItemSkeleton";

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);
const AnimatedBox = Animated.createAnimatedComponent(Box);

export default function PlaylistDetail() {
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [showAlertDialog, setShowAlertDialog] = useState<boolean>(false);
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const { data, isLoading, error } = usePlaylist(id);
  const doDeletePlaylist = useDeletePlaylist();
  const doUpdatePlaylist = useUpdatePlaylist();
  const doShare = useCreateShare();
  const addRecentPlay = useRecentPlays.use.addRecentPlay();
  const colors = useImageColors(artworkUrl(data?.playlist?.coverArt));
  const offsetY = useSharedValue(0);
  const headerStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        offsetY.value,
        [0, 220],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    };
  });
  const scrollHandler = useAnimatedScrollHandler((event) => {
    offsetY.value = event.contentOffset.y;
  });
  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleCloseAlertDialog = () => setShowAlertDialog(false);

  const handlePlaylistUpdatePress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.navigate(`/playlists/${id}/edit`);
  };

  const handlePlaylistDeletePress = () => {
    bottomSheetModalRef.current?.dismiss();
    doDeletePlaylist.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["playlists"] });
          router.back();
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastDescription>
                  Playlist successfully deleted
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
                  An error occurred while deleting the playlist
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const handleSharePress = () => {
    doShare.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["shares"] });
          bottomSheetModalRef.current?.dismiss();
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastDescription>
                  Playlist successfully shared
                </ToastDescription>
              </Toast>
            ),
          });
        },
        onError: (error) => {
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastDescription>
                  An error occurred while sharing the playlist
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const handleDeleteFromPlaylistPress = (index: string) => {
    doUpdatePlaylist.mutate(
      { id, songIndexToRemove: [index] },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["playlist", id] });
          queryClient.invalidateQueries({ queryKey: ["playlists"] });
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastDescription>
                  Track successfully removed from playlist
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
                  An error occurred while removing the track from this playlist
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const handleTrackPressCallback = () => {
    if (data?.playlist) {
      addRecentPlay({
        id,
        title: data?.playlist.name,
        type: "playlist",
        coverArt: data?.playlist?.coverArt,
      });
    }
  };

  return (
    <Box className="h-full">
      <AnimatedBox
        className="w-full z-10 absolute top-0 left-0 right-0"
        style={[headerStyle]}
      >
        <LinearGradient
          colors={[
            (colors?.platform === "ios" ? colors.primary : colors?.vibrant) ||
              "#000",
            (colors?.platform === "ios"
              ? colors.primary
              : colors?.darkVibrant) || "#000",
          ]}
        >
          <HStack
            className="items-center justify-between pb-4 px-6 bg-black/25"
            style={{ paddingTop: insets.top + 16 }}
          >
            <FadeOutScaleDown onPress={() => router.back()}>
              <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                <ArrowLeft size={24} color={themeConfig.theme.colors.white} />
              </Box>
            </FadeOutScaleDown>
            <Heading className="text-white font-bold" size="lg">
              {data?.playlist.name}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </AnimatedBox>
      <AnimatedFlashList
        onScroll={scrollHandler}
        data={data?.playlist.entry?.reverse() || loadingData(16)}
        renderItem={({ item, index }: { item: Child; index: number }) =>
          isLoading ? (
            <TrackListItemSkeleton index={index} />
          ) : (
            <TrackListItem
              track={item}
              index={index}
              handleRemoveFromPlaylist={handleDeleteFromPlaylistPress}
              onPlayCallback={handleTrackPressCallback}
            />
          )
        }
        ListEmptyComponent={() => (
          <VStack className="items-center justify-center my-6">
            <Text className="text-white text-md">This playlist is empty</Text>
            <FadeOutScaleDown
              onPress={() => router.navigate("/(app)/(tabs)/(search)")}
              className="bg-white rounded-full px-6 py-3 mt-4"
            >
              <Text className="text-primary-800 font-bold">
                Find songs to add to this playlist
              </Text>
            </FadeOutScaleDown>
          </VStack>
        )}
        ListHeaderComponent={() => (
          <VStack>
            <HStack className="mt-6 items-start justify-between">
              <FadeOutScaleDown onPress={() => router.back()}>
                <ArrowLeft size={24} color={themeConfig.theme.colors.white} />
              </FadeOutScaleDown>
              {/* https://github.com/navidrome/navidrome/issues/406 */}
              {data?.playlist?.coverArt ? (
                <Image
                  source={{ uri: artworkUrl(data?.playlist?.coverArt) }}
                  className="w-[70%] aspect-square rounded-md"
                  alt="Playlist cover"
                />
              ) : (
                <Box className="w-[70%] aspect-square rounded-md bg-primary-600 items-center justify-center">
                  <ListMusic size={48} color={themeConfig.theme.colors.white} />
                </Box>
              )}

              <Box className="w-6" />
            </HStack>
            <VStack>
              <VStack className="mt-5">
                <Heading numberOfLines={1} className="text-white" size="2xl">
                  {data?.playlist.name}
                </Heading>
                {data?.playlist.comment && (
                  <Text className="text-md text-primary-100 mt-2">
                    {data?.playlist.comment}
                  </Text>
                )}
              </VStack>
              <HStack className="mt-2 items-center">
                <Clock color={"#808080"} size={16} />
                <Text className="ml-2 text-primary-100">
                  {Math.round((data?.playlist.duration || 0) / 60)} min
                </Text>
              </HStack>
              <HStack className="mt-4 items-center justify-between">
                <HStack className="items-center gap-x-4">
                  <FadeOutScaleDown onPress={handlePresentModalPress}>
                    <EllipsisVertical color={themeConfig.theme.colors.white} />
                  </FadeOutScaleDown>
                </HStack>
                <HStack className="items-center gap-x-4">
                  <FadeOutScaleDown>
                    <Shuffle color={themeConfig.theme.colors.white} />
                  </FadeOutScaleDown>
                  <FadeOutScaleDown>
                    <Box className="w-12 h-12 rounded-full bg-emerald-500 items-center justify-center">
                      <Play
                        color={themeConfig.theme.colors.white}
                        fill={themeConfig.theme.colors.white}
                      />
                    </Box>
                  </FadeOutScaleDown>
                </HStack>
              </HStack>
            </VStack>
            {error && <ErrorDisplay error={error} />}
          </VStack>
        )}
        ListFooterComponent={() => (
          <VStack className="my-6">
            <Text className="text-white font-bold">
              {(data?.playlist.songCount || "0 ") +
                (data?.playlist.songCount || 0 > 1 ? " song" : "songs")}{" "}
              ⦁ {Math.round((data?.playlist.duration || 0) / 60)} min
            </Text>
          </VStack>
        )}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: insets.top,
          paddingBottom: bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
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
          <Box className="p-6 w-full mb-12">
            <HStack className="items-center">
              {data?.playlist?.coverArt ? (
                <Image
                  source={{ uri: artworkUrl(data?.playlist?.coverArt) }}
                  className="w-16 h-16 rounded-full aspect-square"
                  alt="Playlist cover"
                />
              ) : (
                <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                  <ListMusic size={24} color={themeConfig.theme.colors.white} />
                </Box>
              )}
              <VStack className="ml-4">
                <Heading
                  className="text-white font-normal"
                  size="lg"
                  numberOfLines={1}
                >
                  {data?.playlist.name}
                </Heading>
              </VStack>
            </HStack>
            <VStack className="mt-6 gap-y-8">
              <FadeOutScaleDown onPress={handlePlaylistUpdatePress}>
                <HStack className="items-center">
                  <Pencil
                    size={24}
                    color={themeConfig.theme.colors.gray[200]}
                  />
                  <Text className="ml-4 text-lg text-gray-200">
                    Edit this playlist
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={handleSharePress}>
                <HStack className="items-center">
                  <Share2
                    size={24}
                    color={themeConfig.theme.colors.gray[200]}
                  />
                  <Text className="ml-4 text-lg text-gray-200">Share</Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() => {
                  bottomSheetModalRef.current?.dismiss();
                  setShowAlertDialog(true);
                }}
              >
                <HStack className="items-center">
                  <X size={24} color={themeConfig.theme.colors.gray[200]} />
                  <Text className="ml-4 text-lg text-gray-200">
                    Delete this playlist
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
      <AlertDialog
        isOpen={showAlertDialog}
        onClose={handleCloseAlertDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              Are you sure you want to delete this playlist?
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              Deleting the playlist will remove it permanently and cannot be
              undone. Please confirm if you want to proceed.
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCloseAlertDialog}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">Cancel</Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handlePlaylistDeletePress}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">Delete</Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}
