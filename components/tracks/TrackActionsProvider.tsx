import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useQueryClient } from "@tanstack/react-query";
import { secondsToMinutes } from "date-fns/secondsToMinutes";
import * as Clipboard from "expo-clipboard";
import { Directory, File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import ArrowDown from "lucide-react-native/dist/esm/icons/arrow-down.mjs";
import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import Check from "lucide-react-native/dist/esm/icons/check.mjs";
import PlusCircle from "lucide-react-native/dist/esm/icons/circle-plus.mjs";
import CircleX from "lucide-react-native/dist/esm/icons/circle-x.mjs";
import ClipboardIcon from "lucide-react-native/dist/esm/icons/clipboard.mjs";
import ClipboardCheck from "lucide-react-native/dist/esm/icons/clipboard-check.mjs";
import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import Download from "lucide-react-native/dist/esm/icons/download.mjs";
import Heart from "lucide-react-native/dist/esm/icons/heart.mjs";
import Info from "lucide-react-native/dist/esm/icons/info.mjs";
import ListPlus from "lucide-react-native/dist/esm/icons/list-plus.mjs";
import ListStart from "lucide-react-native/dist/esm/icons/list-start.mjs";
import Share2 from "lucide-react-native/dist/esm/icons/share-2.mjs";
import Sparkles from "lucide-react-native/dist/esm/icons/sparkles.mjs";
import Star from "lucide-react-native/dist/esm/icons/star.mjs";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
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
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { useSetRating, useStar } from "@/hooks/backend/useMediaAnnotation";
import { useCreateShare } from "@/hooks/backend/useSharing";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useOfflineDownloads } from "@/hooks/useOfflineDownloads";
import type { Child } from "@/services/openSubsonic/types";
import useQueue from "@/stores/queue";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";
import { formatDistanceToNow } from "@/utils/date";
import { niceBytes } from "@/utils/fileSize";
import { downloadUrl } from "@/utils/streaming";

export interface TrackActionsContextValue {
  index?: number;
  handleRemoveFromPlaylist?: (index: string) => void;
}

interface TrackActionsApi {
  open: (track: Child, ctx?: TrackActionsContextValue) => void;
}

const TrackActionsContext = createContext<TrackActionsApi | null>(null);

export function useTrackActions(): TrackActionsApi {
  const ctx = useContext(TrackActionsContext);
  if (!ctx) {
    throw new Error(
      "useTrackActions must be used within a TrackActionsProvider",
    );
  }
  return ctx;
}

export function TrackActionsProvider({ children }: { children: ReactNode }) {
  const [white, black, emerald500, gray200, gray400, red500] =
    Uniwind.getCSSVariable([
      "--color-white",
      "--color-black",
      "--color-emerald-500",
      "--color-gray-200",
      "--color-gray-400",
      "--color-red-500",
    ]) as string[];
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const capabilities = useCapabilities();
  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();
  const {
    offlineModeEnabled,
    isTrackDownloaded,
    isTrackDownloading,
    downloadTrack,
    removeDownloadedTrack,
    getDownloadProgress,
  } = useOfflineDownloads();

  const doFavorite = useStar();
  const doShare = useCreateShare();
  const doSetRating = useSetRating();

  const [track, setTrack] = useState<Child | null>(null);
  const [ctx, setCtx] = useState<TrackActionsContextValue>({});
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [clipboardText, setClipboardText] = useState("");
  const [clipoardCopyDone, setClipoardCopyDone] = useState(false);

  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const bottomSheetShareModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange: handleShareSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetShareModalRef);
  const bottomSheetArtistsModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange: handleArtistsSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetArtistsModalRef);

  const open = useCallback(
    (nextTrack: Child, nextCtx: TrackActionsContextValue = {}) => {
      setTrack(nextTrack);
      setCtx(nextCtx);
      bottomSheetModalRef.current?.present();
    },
    [],
  );

  const trackArtists = track?.artists?.length
    ? track.artists
    : track?.artistId
      ? [{ id: track.artistId, name: track.artist ?? "" }]
      : [];
  const hasMultipleArtists = trackArtists.length > 1;
  const inPlaylistContext = !!ctx.handleRemoveFromPlaylist;

  const handleGoToArtistPress = () => {
    bottomSheetModalRef.current?.dismiss();
    if (hasMultipleArtists) {
      bottomSheetArtistsModalRef.current?.present();
      return;
    }
    const artistId = trackArtists[0]?.id ?? track?.artistId;
    if (artistId) {
      router.navigate(`/artists/${artistId}`);
    }
  };

  const handleArtistPickPress = (artistId: string) => {
    bottomSheetArtistsModalRef.current?.dismiss();
    router.navigate(`/artists/${artistId}`);
  };

  const handleGoToAlbumPress = () => {
    if (!track?.albumId) return;
    bottomSheetModalRef.current?.dismiss();
    router.navigate(`/albums/${track.albumId}`);
  };

  const handleFavoritePress = () => {
    if (!track) return;
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
        onError: () => {
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

  const handlePlayNextPress = () => {
    if (!track) return;
    useQueue.getState().enqueueNext(childToTrack(track));
    bottomSheetModalRef.current?.dismiss();
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {t("app.shared.addedToPlayNextMessage", { count: 1 })}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  const handleAddToQueuePress = () => {
    if (!track) return;
    useQueue.getState().enqueueEnd(childToTrack(track));
    bottomSheetModalRef.current?.dismiss();
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {t("app.shared.addedToQueueMessage", { count: 1 })}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  const handleSharePress = () => {
    if (!track) return;
    doShare.mutate(
      { id: track.id },
      {
        onSuccess: (data) => {
          bottomSheetModalRef.current?.dismiss();
          setClipboardText(data?.shares?.share?.[0]?.url ?? "");
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
    if (!track) return;
    bottomSheetModalRef.current?.dismiss();
    router.navigate({
      pathname: "/playlists/add-to-playlist",
      params: { ids: [track.id] },
    });
  };

  const handleRemoveFromPlaylistPress = () => {
    bottomSheetModalRef.current?.dismiss();
    if (ctx.handleRemoveFromPlaylist && ctx.index !== undefined) {
      ctx.handleRemoveFromPlaylist(ctx.index.toString());
    }
  };

  const handleInfoPress = () => {
    bottomSheetModalRef.current?.dismiss();
    setShowInfoModal(true);
  };

  const handleSimilarSongsPress = () => {
    if (!track) return;
    bottomSheetModalRef.current?.dismiss();
    router.navigate({
      pathname: "/tracks/[id]/similar",
      params: { id: track.id, title: track.title },
    });
  };

  const handleCloseInfoModal = () => setShowInfoModal(false);

  const handleDownloadPress = async () => {
    if (!track) return;
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
    } catch (_error) {
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
    if (!track) return;
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
    if (!track) return;
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

  const handleOfflineDownloadPress = async () => {
    if (!track) return;
    bottomSheetModalRef.current?.dismiss();
    try {
      await downloadTrack(track);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.tracks.offlineDownloadSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    } catch (error) {
      console.error("Error downloading track for offline:", error);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.tracks.offlineDownloadErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  const handleRemoveOfflineDownloadPress = async () => {
    if (!track) return;
    bottomSheetModalRef.current?.dismiss();
    try {
      await removeDownloadedTrack(track.id);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.tracks.removeOfflineDownloadSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    } catch (error) {
      console.error("Error removing offline download:", error);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.tracks.removeOfflineDownloadErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  return (
    <TrackActionsContext.Provider value={{ open }}>
      {children}
      <BottomSheetModal
        ref={bottomSheetArtistsModalRef}
        onChange={handleArtistsSheetPositionChange}
        backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
        handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView style={{ flex: 1, alignItems: "center" }}>
          <Box className="p-6 w-full mb-12">
            <VStack className="gap-y-6">
              {trackArtists.map((artist) => (
                <FadeOutScaleDown
                  key={artist.id}
                  onPress={() => handleArtistPickPress(artist.id)}
                >
                  <HStack className="items-center">
                    <User size={24} color={gray200} />
                    <Text
                      className="ml-4 text-lg text-gray-200"
                      numberOfLines={1}
                    >
                      {artist.name}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              ))}
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
      <BottomSheetModal
        ref={bottomSheetShareModalRef}
        onChange={handleShareSheetPositionChange}
        backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
        handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView style={{ flex: 1, alignItems: "center" }}>
          <Box className="p-6 w-full mb-12">
            <HStack className="items-center">
              <FadeOutScaleDown
                className="flex-row gap-x-4 items-center justify-between flex-1  overflow-hidden"
                onPress={handleCopyShareUrlPress}
              >
                {clipoardCopyDone ? (
                  <ClipboardCheck size={24} color={emerald500} />
                ) : (
                  <ClipboardIcon size={24} color={gray200} />
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
        backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
        handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView style={{ flex: 1, alignItems: "center" }}>
          {track && (
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
                    <AudioLines size={24} color={white} />
                  </Box>
                )}
                <VStack className="ml-4 flex-1">
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
                      <Heart size={24} color={gray200} />
                      <Text className="ml-4 text-lg text-gray-200">
                        {t("app.tracks.addToFavorites")}
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
                )}
                <FadeOutScaleDown onPress={handleAddToPlaylistPress}>
                  <HStack className="items-center">
                    <PlusCircle size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {inPlaylistContext
                        ? t("app.tracks.addToAnotherPlaylist")
                        : t("app.tracks.addToPlaylist")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                {inPlaylistContext && (
                  <FadeOutScaleDown onPress={handleRemoveFromPlaylistPress}>
                    <HStack className="items-center">
                      <CircleX size={24} color={gray200} />
                      <Text className="ml-4 text-lg text-gray-200">
                        {t("app.tracks.removeFromPlaylist")}
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
                )}
                <FadeOutScaleDown onPress={handleGoToArtistPress}>
                  <HStack className="items-center">
                    <User size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.goToArtist", {
                        count: trackArtists.length || 1,
                      })}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                {track.albumId && (
                  <FadeOutScaleDown onPress={handleGoToAlbumPress}>
                    <HStack className="items-center">
                      <Disc3 size={24} color={gray200} />
                      <Text className="ml-4 text-lg text-gray-200">
                        {t("app.tracks.goToAlbum")}
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
                )}
                <FadeOutScaleDown onPress={handlePlayNextPress}>
                  <HStack className="items-center">
                    <ListStart size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.playNext")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={handleAddToQueuePress}>
                  <HStack className="items-center">
                    <ListPlus size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.addToQueue")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                {capabilities.setRating && (
                  <FadeOutScaleDown onPress={handleRatingPress}>
                    <HStack className="items-center justify-between">
                      <HStack className="items-center">
                        <Star size={24} color={gray200} />
                        <Text className="ml-4 text-lg text-gray-200">
                          {t("app.tracks.rate")}
                        </Text>
                      </HStack>
                      <HStack className="items-center">
                        {track?.userRating && (
                          <Text className="ml-4 text-lg text-emerald-500">
                            {track?.userRating}/5
                          </Text>
                        )}
                      </HStack>
                    </HStack>
                  </FadeOutScaleDown>
                )}
                <FadeOutScaleDown onPress={handleSimilarSongsPress}>
                  <HStack className="items-center">
                    <Sparkles size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.similarSongs")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                {capabilities.sharing && (
                  <FadeOutScaleDown onPress={handleSharePress}>
                    <HStack className="items-center">
                      <Share2 size={24} color={gray200} />
                      <Text className="ml-4 text-lg text-gray-200">
                        {t("app.tracks.share")}
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
                )}
                <FadeOutScaleDown onPress={handleInfoPress}>
                  <HStack className="items-center">
                    <Info size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.getInfo")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={handleDownloadPress}>
                  <HStack className="items-center">
                    <Download size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.download")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                {offlineModeEnabled && track.starred && (
                  <>
                    {!isTrackDownloading(track.id) &&
                      !isTrackDownloaded(track.id) && (
                        <FadeOutScaleDown onPress={handleOfflineDownloadPress}>
                          <HStack className="items-center">
                            <Box className="size-6 rounded-full bg-emerald-500 items-center justify-center">
                              <ArrowDown size={20} color={black} />
                            </Box>
                            <Text className="ml-4 text-lg text-emerald-400">
                              {t("app.tracks.downloadForOffline")}
                            </Text>
                          </HStack>
                        </FadeOutScaleDown>
                      )}
                    {isTrackDownloading(track.id) && (
                      <HStack className="items-center">
                        <Download size={24} color={gray400} />
                        <Text className="ml-4 text-lg text-gray-400">
                          {t("app.tracks.downloadingForOffline")} (
                          {getDownloadProgress(track.id)?.progress || 0}%)
                        </Text>
                      </HStack>
                    )}
                    {isTrackDownloaded(track.id) && (
                      <FadeOutScaleDown
                        onPress={handleRemoveOfflineDownloadPress}
                      >
                        <HStack className="items-center">
                          <X size={24} color={red500} />
                          <Text className="ml-4 text-lg text-red-400">
                            {t("app.tracks.removeOfflineDownload")}
                          </Text>
                        </HStack>
                      </FadeOutScaleDown>
                    )}
                  </>
                )}
                {track?.musicBrainzId && (
                  <FadeOutScaleDown onPress={handleMusicBrainzPress}>
                    <HStack className="items-center">
                      <MusicBrainz width={24} height={24} fill={gray200} />
                      <Text className="ml-4 text-lg text-gray-200">
                        {t("app.tracks.musicBrainz")}
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
                )}
              </VStack>
            </Box>
          )}
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
              value={track?.userRating || 0}
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
          <ModalBody className="mb-0 pb-0" showsVerticalScrollIndicator={false}>
            {track && (
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
                      : t("app.tracks.infoModal.unknownDuration")}
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
                      <Check color={white} size={14} />
                    ) : (
                      <X color={white} size={14} />
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
                      ? t("app.tracks.infoModal.lastPlayedDistance", {
                          distance: formatDistanceToNow(new Date(track.played)),
                        })
                      : t("app.tracks.infoModal.neverPlayed")}
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
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </TrackActionsContext.Provider>
  );
}
