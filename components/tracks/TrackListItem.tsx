import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useStar, useUnstar } from "@/hooks/openSubsonic/useMediaAnnotation";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import { useCreateShare } from "@/hooks/openSubsonic/useSharing";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import type { Child } from "@/services/openSubsonic/types";
import { childToTrack } from "@/utils/childToTrack";
import { streamUrl } from "@/utils/streaming";
import { cn } from "@/utils/tailwind";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useRoute } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import TrackPlayer, {
  useActiveTrack,
} from "@weights-ai/react-native-track-player";
import { useRouter } from "expo-router";
import {
  AudioLines,
  CircleX,
  EllipsisVertical,
  Heart,
  ListPlus,
  PlusCircle,
  Share,
  User,
} from "lucide-react-native";
import { useCallback, useRef } from "react";

interface TrackListItemProps {
  track: Child;
  cover?: string;
  index: number;
  showIndex?: boolean;
}

export default function TrackListItem({
  track,
  cover,
  index,
  showIndex = false,
}: TrackListItemProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const route = useRoute();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const activeTrack = useActiveTrack();
  const trackCover = useGetCoverArt(
    track.coverArt,
    { size: 600 },
    !!(!cover && track.coverArt),
  );
  const doFavorite = useStar();
  const doUnfavorite = useUnstar();
  const doShare = useCreateShare();
  const toast = useToast();

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleGoToArtistPress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.navigate(`/artists/${track.artistId}`);
  };

  const handleFavoritePress = () => {
    doFavorite.mutate(
      { id: track.id },
      {
        onSuccess: () => {
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastDescription>
                  Track successfully added to favorites
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
                  An error occurred while adding track to favorites
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const handleUnfavoritePress = () => {
    doUnfavorite.mutate(
      { id: track.id },
      {
        onSuccess: () => {
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastDescription>
                  Track successfully removed from favorites
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
                  An error occurred while removing the track from favorites
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
      { id: track.id },
      {
        onSuccess: () => {
          bottomSheetModalRef.current?.dismiss();
          queryClient.invalidateQueries({ queryKey: ["shares"] });
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastDescription>Track successfully shared</ToastDescription>
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
                  An error occurred while sharing the track
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const handleAddToPlaylistPress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.navigate({
      pathname: "/playlists/add-to-playlist",
      params: { ids: [track.id] },
    });
  };

  const handleTrackPress = useCallback(async () => {
    await TrackPlayer.stop();
    await TrackPlayer.reset();
    await TrackPlayer.add([childToTrack(track, cover || trackCover.data)]);

    await TrackPlayer.play();
  }, [track, cover, trackCover]);

  return (
    <Pressable onPress={handleTrackPress}>
      <HStack
        className={cn("items-center justify-between mb-4", {
          "mt-6": index === 0,
        })}
      >
        <HStack className="items-center">
          {showIndex && (
            <Text className="text-sm text-white mr-4">{index + 1}</Text>
          )}
          {cover || trackCover.data ? (
            <Image
              source={{
                uri: `data:image/jpeg;base64,${cover || trackCover.data}`,
              }}
              className="w-16 h-16 rounded-md aspect-square"
              alt="Track cover"
            />
          ) : (
            <Box className="w-16 h-16 aspect-square rounded-md bg-primary-600 items-center justify-center">
              <AudioLines size={24} color={themeConfig.theme.colors.white} />
            </Box>
          )}
          <VStack className="ml-4">
            <Heading
              className={cn("text-white text-md font-normal capitalize", {
                "text-emerald-500": activeTrack?.title === track.title,
              })}
              numberOfLines={1}
            >
              {track.title}
            </Heading>
            <Text numberOfLines={1} className="text-md text-primary-100">
              {track.artist}
            </Text>
          </VStack>
        </HStack>
        <HStack className="items-center">
          {track.starred && (
            <FadeOutScaleDown onPress={handleUnfavoritePress} className="mr-3">
              <Heart
                color={themeConfig.theme.colors.emerald[500]}
                size={24}
                fill={themeConfig.theme.colors.emerald[500]}
              />
            </FadeOutScaleDown>
          )}
          <FadeOutScaleDown onPress={handlePresentModalPress}>
            <EllipsisVertical color={themeConfig.theme.colors.gray[300]} />
          </FadeOutScaleDown>
        </HStack>
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
            <Box className="p-6 w-full pb-12">
              <HStack className="items-center">
                {cover ? (
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${cover}` }}
                    className="w-16 h-16 rounded-md aspect-square"
                    alt="Track cover"
                  />
                ) : (
                  <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                    <AudioLines
                      size={24}
                      color={themeConfig.theme.colors.white}
                    />
                  </Box>
                )}
                <VStack className="ml-4">
                  <Heading
                    className="text-white font-normal"
                    size="lg"
                    numberOfLines={1}
                  >
                    {track.title}
                  </Heading>
                  <Text numberOfLines={1} className="text-md text-primary-100">
                    {track.artist} ⦁ {track.album}
                  </Text>
                </VStack>
              </HStack>
              <VStack className="mt-6 gap-y-8">
                {!track.starred && (
                  <FadeOutScaleDown onPress={handleFavoritePress}>
                    <HStack className="items-center">
                      <Heart
                        size={24}
                        color={themeConfig.theme.colors.gray[200]}
                      />
                      <Text className="ml-4 text-lg text-gray-200">
                        Add to favorites
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
                )}
                <FadeOutScaleDown onPress={handleAddToPlaylistPress}>
                  <HStack className="items-center">
                    <PlusCircle
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      {route.name === "playlists/[id]/index"
                        ? "Add to another playlist"
                        : "Add to playlist"}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                {route.name === "playlists/[id]/index" && (
                  <FadeOutScaleDown>
                    <HStack className="items-center">
                      <CircleX
                        size={24}
                        color={themeConfig.theme.colors.gray[200]}
                      />
                      <Text className="ml-4 text-lg text-gray-200">
                        Remove from playlist
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
                )}
                <FadeOutScaleDown onPress={handleGoToArtistPress}>
                  <HStack className="items-center">
                    <User
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      Go to artist
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <FadeOutScaleDown>
                  <HStack className="items-center">
                    <ListPlus
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      Add to queue
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={handleSharePress}>
                  <HStack className="items-center">
                    <Share
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">Share</Text>
                  </HStack>
                </FadeOutScaleDown>
              </VStack>
            </Box>
          </BottomSheetView>
        </BottomSheetModal>
      </HStack>
    </Pressable>
  );
}
