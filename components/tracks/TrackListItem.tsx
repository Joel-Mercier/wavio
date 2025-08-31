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
import { useUpdatePlaylist } from "@/hooks/openSubsonic/usePlaylists";
import { useCreateShare } from "@/hooks/openSubsonic/useSharing";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import type { Child } from "@/services/openSubsonic/types";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";
import { niceBytes } from "@/utils/fileSize";
import { streamUrl } from "@/utils/streaming";
import { cn } from "@/utils/tailwind";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useRoute } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, secondsToMinutes } from "date-fns";
import { useRouter } from "expo-router";
import {
  AudioLines,
  Check,
  CircleX,
  EllipsisVertical,
  Heart,
  Info,
  ListPlus,
  PlusCircle,
  Share,
  User,
  X,
} from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { AudioPro, useAudioPro } from "react-native-audio-pro";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../ui/icon";
import {
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "../ui/modal";

interface TrackListItemProps {
  track: Child;
  index: number;
  showIndex?: boolean;
  handleRemoveFromPlaylist?: (index: string) => void;
  className?: string;
  onPlayCallback?: () => void;
}

export default function TrackListItem({
  track,
  index,
  showIndex = false,
  handleRemoveFromPlaylist,
  className,
  onPlayCallback,
}: TrackListItemProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const route = useRoute();
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const { playingTrack } = useAudioPro();
  const doFavorite = useStar();
  const doUnfavorite = useUnstar();
  const doShare = useCreateShare();
  const toast = useToast();
  const insets = useSafeAreaInsets();

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

  const handleRemoveFromPlaylistPress = () => {
    bottomSheetModalRef.current?.dismiss();
    if (handleRemoveFromPlaylist) {
      handleRemoveFromPlaylist(index.toString());
    }
  };

  const handleInfoPress = () => {
    bottomSheetModalRef.current?.dismiss();
    setShowInfoModal(true);
  };

  const handleCloseInfoModal = () => setShowInfoModal(false);

  const handleTrackPress = () => {
    // AudioPro.stop();
    // AudioPro.clear();
    // console.log(trackCover, cover);
    const audioProTrack = childToTrack(track);
    console.log("LOG URL", audioProTrack.artwork);
    AudioPro.play(audioProTrack);
    // AudioPro.resume();
    if (onPlayCallback) {
      onPlayCallback();
    }
  };

  return (
    <Pressable onPress={handleTrackPress}>
      <HStack
        className={cn(
          "items-center justify-between mb-4",
          {
            "mt-6": index === 0,
          },
          className,
        )}
      >
        <HStack className="items-center">
          {showIndex && (
            <Text className="text-sm text-white mr-4">{index + 1}</Text>
          )}
          {track.coverArt ? (
            <Image
              source={{
                uri: artworkUrl(track.coverArt),
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
                "text-emerald-500": playingTrack?.title === track.title,
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
                stroke={undefined}
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
                {track.coverArt ? (
                  <Image
                    source={{ uri: track.coverArt }}
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
                  <FadeOutScaleDown onPress={handleRemoveFromPlaylistPress}>
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
                <FadeOutScaleDown onPress={handleInfoPress}>
                  <HStack className="items-center">
                    <Info
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">Get info</Text>
                  </HStack>
                </FadeOutScaleDown>
              </VStack>
            </Box>
          </BottomSheetView>
        </BottomSheetModal>
        <Modal
          isOpen={showInfoModal}
          onClose={handleCloseInfoModal}
          closeOnOverlayClick
        >
          <ModalBackdrop />
          <ModalContent
            className="bg-primary-800 border-primary-600 max-h-[80%]"
            style={{ marginBottom: insets.bottom, marginTop: insets.top }}
          >
            <ModalHeader>
              <Heading className="text-white">Track info</Heading>
              <ModalCloseButton>
                <Icon as={X} size="md" className="color-white" />
              </ModalCloseButton>
            </ModalHeader>
            <ModalBody>
              <VStack className="gap-y-2">
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Title</Text>
                  <Text className="text-white">{track.title}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Path</Text>
                  <Text className="text-white">{track.path}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Album artist</Text>
                  <Text className="text-white">{track.artist}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Artists</Text>
                  <Text className="text-white">
                    {track.artists?.map((artist) => artist.name).join(", ")}
                  </Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Album</Text>
                  <Text className="text-white">{track.album}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Disc</Text>
                  <Text className="text-white">{track.discNumber}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Track</Text>
                  <Text className="text-white">{track.track}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Release year</Text>
                  <Text className="text-white">{track.year}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Genres</Text>
                  <Text className="text-white">
                    {track.genres?.map((genre) => genre.name)?.join(", ")}
                  </Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Duration</Text>
                  <Text className="text-white">
                    {track.duration
                      ? `${secondsToMinutes(track?.duration)}:${track?.duration % 60}`
                      : "Unknown"}
                  </Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Codec</Text>
                  <Text className="text-white">{track.suffix}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Bitrate</Text>
                  <Text className="text-white">{track.bitRate}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Channels</Text>
                  <Text className="text-white">{track.channelCount}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Size</Text>
                  <Text className="text-white">
                    {niceBytes(track.size || 0)}
                  </Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Favorite</Text>
                  <Text className="text-white">
                    {track.starred ? (
                      <Check color={themeConfig.theme.colors.white} size={14} />
                    ) : (
                      <X color={themeConfig.theme.colors.white} size={14} />
                    )}
                  </Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Play count</Text>
                  <Text className="text-white">{track.playCount}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Last played</Text>
                  <Text className="text-white">
                    {track.played
                      ? `${formatDistanceToNow(new Date(track.played))} ago`
                      : "Never"}
                  </Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Modified</Text>
                  <Text className="text-white">{track.genre}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Album peak</Text>
                  <Text className="text-white">
                    {track.replayGain?.albumPeak}
                  </Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">Track peak</Text>
                  <Text className="text-white">
                    {track.replayGain?.trackPeak}
                  </Text>
                </VStack>
              </VStack>
            </ModalBody>
          </ModalContent>
        </Modal>
      </HStack>
    </Pressable>
  );
}
