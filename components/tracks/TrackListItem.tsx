import MusicBrainz from "@/assets/images/musicbrainz.svg";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import StarRating from "@/components/StarRating";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Icon } from "@/components/ui/icon";
import { Image } from "@/components/ui/image";
import {
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
} from "@/components/ui/modal";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import {
  useSetRating,
  useStar,
  useUnstar,
} from "@/hooks/openSubsonic/useMediaAnnotation";
import { useUpdatePlaylist } from "@/hooks/openSubsonic/usePlaylists";
import { useCreateShare } from "@/hooks/openSubsonic/useSharing";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import type { Child } from "@/services/openSubsonic/types";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";
import { niceBytes } from "@/utils/fileSize";
import { downloadUrl } from "@/utils/streaming";
import { cn } from "@/utils/tailwind";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useRoute } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, secondsToMinutes } from "date-fns";
import * as Clipboard from "expo-clipboard";
import { Directory, File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import {
  AudioLines,
  Check,
  CircleX,
  ClipboardCheck,
  ClipboardIcon,
  Download,
  EllipsisVertical,
  Heart,
  Info,
  ListPlus,
  PlusCircle,
  Share,
  Star,
  User,
  X,
} from "lucide-react-native";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import { AudioPro, useAudioPro } from "react-native-audio-pro";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface TrackListItemProps {
  track: Child;
  index: number;
  showIndex?: boolean;
  handleRemoveFromPlaylist?: (index: string) => void;
  className?: string;
  onPlayCallback?: () => void;
  showCoverArt?: boolean;
}

export default function TrackListItem({
  track,
  index,
  showIndex = false,
  handleRemoveFromPlaylist,
  className,
  onPlayCallback,
  showCoverArt = true,
}: TrackListItemProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const route = useRoute();
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [showRatingModal, setShowRatingModal] = useState<boolean>(false);
  const [clipboardText, setClipboardText] = useState("");
  const [clipoardCopyDone, setClipoardCopyDone] = useState(false);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const bottomSheetShareModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange: handleShareSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetShareModalRef);
  const { playingTrack } = useAudioPro();
  const doFavorite = useStar();
  const doUnfavorite = useUnstar();
  const doShare = useCreateShare();
  const doSetRating = useSetRating();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();

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
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.tracks.favoriteSuccessMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
        onError: (error) => {
          console.log(error);
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.tracks.favoriteErrorMessage")}
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
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.tracks.unfavoriteSuccessMessage")}
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
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.tracks.unfavoriteErrorMessage")}
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
        onSuccess: (data) => {
          bottomSheetModalRef.current?.dismiss();
          setClipboardText(data?.shares?.share[0]?.url);
          queryClient.invalidateQueries({ queryKey: ["shares"] });
          bottomSheetShareModalRef.current?.present();
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.tracks.shareSuccessMessage")}
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
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.tracks.shareErrorMessage")}
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

  const handleDownloadPress = async () => {
    bottomSheetModalRef.current?.dismiss();
    if (permissionResponse?.status !== "granted") {
      await requestPermission();
    }
    const url = downloadUrl(track.id);
    const destination = new Directory(Paths.cache, "Downloads");
    try {
      destination.create({
        idempotent: true,
        intermediates: true,
      });
      const output = await File.downloadFileAsync(url, destination, {
        idempotent: true,
      });
      if (output.exists) {
        await MediaLibrary.saveToLibraryAsync(output.uri);
        output.delete();
        toast.show({
          placement: "top",
          duration: 3000,
          render: () => (
            <Toast action="success">
              <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
              <ToastDescription>
                {t("app.tracks.downloadSuccessMessage")}
              </ToastDescription>
            </Toast>
          ),
        });
      }
    } catch (error) {
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.tracks.downloadErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  const handleRatingPress = () => {
    bottomSheetModalRef.current?.dismiss();
    setShowRatingModal(true);
  };

  const handleCloseRatingModal = () => setShowRatingModal(false);

  const handleRatingChange = (rating: number) => {
    doSetRating.mutate(
      { id: track.id, rating },
      {
        onSuccess: () => {
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.tracks.rateSuccessMessage")}
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
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.tracks.rateErrorMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  useEffect(() => {
    if (clipoardCopyDone) {
      const timer = setTimeout(() => {
        setClipoardCopyDone(false);
      }, 1000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [clipoardCopyDone]);

  const handleCopyShareUrlPress = async () => {
    try {
      if (clipboardText) {
        await Clipboard.setStringAsync(clipboardText);
        setClipoardCopyDone(true);
        toast.show({
          placement: "top",
          duration: 3000,
          render: () => (
            <Toast action="success">
              <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
              <ToastDescription>
                {t("app.shared.shareUrlCopiedMessage")}
              </ToastDescription>
            </Toast>
          ),
        });
      }
    } catch (e) {
      console.error(e);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.shared.shareUrlErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  const handleMusicBrainzPress = async () => {
    bottomSheetModalRef.current?.dismiss();
    if (
      track?.musicBrainzId &&
      (await Linking.canOpenURL(
        `https://musicbrainz.org/recording/${track?.musicBrainzId}`,
      ))
    ) {
      Linking.openURL(
        `https://musicbrainz.org/recording/${track?.musicBrainzId}`,
      );
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
          {showCoverArt &&
            (track.coverArt ? (
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
            ))}
          <VStack
            className={cn({
              "ml-4": showCoverArt,
            })}
          >
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
          ref={bottomSheetShareModalRef}
          onChange={handleShareSheetPositionChange}
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
                <FadeOutScaleDown
                  className="flex-row gap-x-4 items-center justify-between flex-1  overflow-hidden"
                  onPress={handleCopyShareUrlPress}
                >
                  {clipoardCopyDone ? (
                    <ClipboardCheck
                      size={24}
                      color={themeConfig.theme.colors.emerald[500]}
                    />
                  ) : (
                    <ClipboardIcon
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                  )}
                  <Text
                    className="text-lg text-gray-200 py-1 px-3 bg-primary-900 rounded-xl  flex-1 grow"
                    ellipsizeMode="tail"
                    numberOfLines={1}
                  >
                    {clipboardText}
                  </Text>
                </FadeOutScaleDown>
              </HStack>
            </Box>
          </BottomSheetView>
        </BottomSheetModal>
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
                {track.coverArt ? (
                  <Image
                    source={{ uri: artworkUrl(track.coverArt) }}
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
                        {t("app.tracks.addToFavorites")}
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
                        ? t("app.tracks.addToAnotherPlaylist")
                        : t("app.tracks.addToPlaylist")}
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
                        {t("app.tracks.removeFromPlaylist")}
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
                      {t("app.tracks.goToArtist")}
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
                      {t("app.tracks.addToQueue")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={handleRatingPress}>
                  <HStack className="items-center">
                    <Star
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.rate")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={handleSharePress}>
                  <HStack className="items-center">
                    <Share
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.share")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={handleInfoPress}>
                  <HStack className="items-center">
                    <Info
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.getInfo")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={handleDownloadPress}>
                  <HStack className="items-center">
                    <Download
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.download")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                {track?.musicBrainzId && (
                  <FadeOutScaleDown onPress={handleMusicBrainzPress}>
                    <HStack className="items-center">
                      <MusicBrainz
                        width={24}
                        height={24}
                        fill={themeConfig.theme.colors.gray[200]}
                      />
                      <Text className="ml-4 text-lg text-gray-200">
                        {t("app.tracks.musicBrainz")}
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
                )}
              </VStack>
            </Box>
          </BottomSheetView>
        </BottomSheetModal>
        <Modal
          isOpen={showRatingModal}
          onClose={handleCloseRatingModal}
          closeOnOverlayClick
        >
          <ModalBackdrop />
          <ModalContent
            className="bg-primary-800 border-primary-600 max-h-[80%]"
            style={{ marginBottom: insets.bottom, marginTop: insets.top }}
          >
            <ModalHeader>
              <Heading className="text-white">
                {t("app.tracks.rateModalTitle")}
              </Heading>
              <ModalCloseButton>
                <Icon as={X} size="md" className="color-white" />
              </ModalCloseButton>
            </ModalHeader>
            <ModalBody className="mb-0 pb-0">
              <StarRating
                value={track.userRating || 0}
                onChange={handleRatingChange}
              />
            </ModalBody>
          </ModalContent>
        </Modal>
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
              <Heading className="text-white">
                {t("app.tracks.trackInfoModalTitle")}
              </Heading>
              <ModalCloseButton>
                <Icon as={X} size="md" className="color-white" />
              </ModalCloseButton>
            </ModalHeader>
            <ModalBody className="mb-0 pb-0">
              <VStack className="gap-y-2">
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.title")}
                  </Text>
                  <Text className="text-white">{track.title}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.path")}
                  </Text>
                  <Text className="text-white">{track.path}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.artist")}
                  </Text>
                  <Text className="text-white">{track.artist}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.artists")}
                  </Text>
                  <Text className="text-white">
                    {track.artists?.map((artist) => artist.name).join(", ")}
                  </Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.album")}
                  </Text>
                  <Text className="text-white">{track.album}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.discNumber")}
                  </Text>
                  <Text className="text-white">{track.discNumber}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.track")}
                  </Text>
                  <Text className="text-white">{track.track}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.year")}
                  </Text>
                  <Text className="text-white">{track.year}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.genres")}
                  </Text>
                  <Text className="text-white">
                    {track.genres?.map((genre) => genre.name)?.join(", ")}
                  </Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.duration")}
                  </Text>
                  <Text className="text-white">
                    {track.duration
                      ? `${secondsToMinutes(track?.duration)}:${track?.duration % 60}`
                      : "Unknown"}
                  </Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.codec")}
                  </Text>
                  <Text className="text-white">{track.suffix}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.bitRate")}
                  </Text>
                  <Text className="text-white">{track.bitRate}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.channelCount")}
                  </Text>
                  <Text className="text-white">{track.channelCount}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.size")}
                  </Text>
                  <Text className="text-white">
                    {niceBytes(track.size || 0)}
                  </Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.favorite")}
                  </Text>
                  <Text className="text-white">
                    {track.starred ? (
                      <Check color={themeConfig.theme.colors.white} size={14} />
                    ) : (
                      <X color={themeConfig.theme.colors.white} size={14} />
                    )}
                  </Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.playCount")}
                  </Text>
                  <Text className="text-white">{track.playCount}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.lastPlayed")}
                  </Text>
                  <Text className="text-white">
                    {track.played
                      ? `${formatDistanceToNow(new Date(track.played))} ago`
                      : "Never"}
                  </Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.modified")}
                  </Text>
                  <Text className="text-white">{track.genre}</Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.albumPeak")}
                  </Text>
                  <Text className="text-white">
                    {track.replayGain?.albumPeak}
                  </Text>
                </VStack>
                <VStack className="border-b border-primary-600 py-2">
                  <Text className="text-primary-100 text-sm">
                    {t("app.tracks.infoModal.trackPeak")}
                  </Text>
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
