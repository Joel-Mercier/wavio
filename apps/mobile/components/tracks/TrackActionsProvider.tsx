import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import ArrowDown from "lucide-react-native/dist/esm/icons/arrow-down.mjs";
import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import PlusCircle from "lucide-react-native/dist/esm/icons/circle-plus.mjs";
import CircleX from "lucide-react-native/dist/esm/icons/circle-x.mjs";
import ClipboardIcon from "lucide-react-native/dist/esm/icons/clipboard.mjs";
import ClipboardCheck from "lucide-react-native/dist/esm/icons/clipboard-check.mjs";
import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import Download from "lucide-react-native/dist/esm/icons/download.mjs";
import Heart from "lucide-react-native/dist/esm/icons/heart.mjs";
import Info from "lucide-react-native/dist/esm/icons/info.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
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
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import MusicBrainz from "@/assets/images/musicbrainz.svg";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import RatingModal from "@/components/RatingModal";
import TrackInfoModal from "@/components/tracks/TrackInfoModal";
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
import {
  useIsCollectionAvailableOffline,
  useIsDetailCached,
  useOfflineDownloads,
} from "@/hooks/offline";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useIsOnline } from "@/hooks/useIsOnline";
import type { Child } from "@/services/openSubsonic/types";
import { saveTrackToDevice } from "@/services/saveTrackToDevice";
import useQueue from "@/stores/queue";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";
import { logError } from "@/utils/log";

export interface TrackActionsContextValue {
  index?: number;
  handleRemoveFromPlaylist?: (index: string) => void;
}

export interface TrackActionsApi {
  open: (track: Child, ctx?: TrackActionsContextValue) => void;
  // Direct action entry points (used by the track-row swipe gesture) that skip
  // the bottom sheet. They reuse the same mutations/navigation/toasts as the
  // sheet, but operate on an explicit track passed by the caller.
  addToQueue: (track: Child) => void;
  playNext: (track: Child) => void;
  addToPlaylist: (track: Child) => void;
  showInfo: (track: Child) => void;
  rate: (track: Child) => void;
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
  const isOnline = useIsOnline();
  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();
  const {
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
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [clipboardText, setClipboardText] = useState("");
  const [clipoardCopyDone, setClipoardCopyDone] = useState(false);

  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetShareModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetArtistsModalRef = useRef<BottomSheetModal>(null);

  const open = useCallback(
    (nextTrack: Child, nextCtx: TrackActionsContextValue = {}) => {
      setTrack(nextTrack);
      setCtx(nextCtx);
      bottomSheetModalRef.current?.present();
    },
    [],
  );

  const addToQueue = useCallback(
    (target: Child) => {
      useQueue.getState().enqueueEnd(childToTrack(target));
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
    },
    [toast, t],
  );

  const playNext = useCallback(
    (target: Child) => {
      useQueue.getState().enqueueNext(childToTrack(target));
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
    },
    [toast, t],
  );

  const addToPlaylist = useCallback(
    (target: Child) => {
      router.navigate({
        pathname: "/playlists/add-to-playlist",
        params: { ids: [target.id] },
      });
    },
    [router],
  );

  const showInfo = useCallback((target: Child) => {
    setTrack(target);
    setShowInfoModal(true);
  }, []);

  const rate = useCallback((target: Child) => {
    setTrack(target);
    setShowRatingModal(true);
  }, []);

  const trackArtists = track?.artists?.length
    ? track.artists
    : track?.artistId
      ? [{ id: track.artistId, name: track.artist ?? "" }]
      : [];
  const hasMultipleArtists = trackArtists.length > 1;
  const inPlaylistContext = !!ctx.handleRemoveFromPlaylist;
  const primaryArtistId = trackArtists[0]?.id ?? track?.artistId;
  const albumDetailCached = useIsDetailCached(
    track?.albumId ? ["album", track.albumId] : null,
  );
  const albumDownloaded = useIsCollectionAvailableOffline(
    "album",
    track?.albumId,
  );
  const albumReachable = albumDetailCached || albumDownloaded;
  const artistReachable = useIsDetailCached(
    primaryArtistId ? ["artist", primaryArtistId] : null,
  );

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
        onError: () => {
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

  const handleCreditsPress = () => {
    bottomSheetModalRef.current?.dismiss();
    setShowCreditsModal(true);
  };

  const handleCloseCreditsModal = () => setShowCreditsModal(false);

  const hasCredits =
    !!track?.displayAlbumArtist ||
    !!track?.displayComposer ||
    !!track?.contributors?.length;

  const handleDownloadPress = async () => {
    if (!track) return;
    bottomSheetModalRef.current?.dismiss();
    if (permissionResponse?.status !== "granted") {
      await requestPermission();
    }
    try {
      await saveTrackToDevice(track);
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
    } catch (error) {
      logError("Error downloading track to device:", error);
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
          setShowRatingModal(false);
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
          logError(error);
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
      logError(e);
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
      logError("Error downloading track for offline:", error);
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
      logError("Error removing offline download:", error);
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

  const api = useMemo<TrackActionsApi>(
    () => ({ open, addToQueue, playNext, addToPlaylist, showInfo, rate }),
    [open, addToQueue, playNext, addToPlaylist, showInfo, rate],
  );

  return (
    <TrackActionsContext.Provider value={api}>
      {children}
      <CenteredBottomSheetModal
        ref={bottomSheetArtistsModalRef}
        enableHalfExpand={false}
        backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
        handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
      >
        <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
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
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
      <CenteredBottomSheetModal
        ref={bottomSheetShareModalRef}
        enableHalfExpand={false}
        backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
        handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
      >
        <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
          <Box className="p-6 w-full mb-12">
            <HStack className="items-center">
              <FadeOutScaleDown
                testID="share-copy-button"
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
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
      <CenteredBottomSheetModal
        ref={bottomSheetModalRef}
        backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
        handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
      >
        <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
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
                    {track.artist || t("app.shared.unknownArtist")} ⦁{" "}
                    {track.album || t("app.shared.unknownAlbum")}
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
                <FadeOutScaleDown
                  onPress={handleGoToArtistPress}
                  disabled={!artistReachable}
                >
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
                  <FadeOutScaleDown
                    onPress={handleGoToAlbumPress}
                    disabled={!albumReachable}
                  >
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
                {capabilities.offlineDownload &&
                  !isTrackDownloading(track.id) &&
                  !isTrackDownloaded(track.id) && (
                    <FadeOutScaleDown
                      onPress={handleOfflineDownloadPress}
                      disabled={!isOnline}
                    >
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
                {capabilities.offlineDownload &&
                  isTrackDownloading(track.id) && (
                    <HStack className="items-center">
                      <Download size={24} color={gray400} />
                      <Text className="ml-4 text-lg text-gray-400">
                        {t("app.tracks.downloadingForOffline")} (
                        {getDownloadProgress(track.id)?.progress || 0}%)
                      </Text>
                    </HStack>
                  )}
                {capabilities.offlineDownload &&
                  isTrackDownloaded(track.id) && (
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
                {capabilities.similarSongs && (
                  <FadeOutScaleDown
                    onPress={handleSimilarSongsPress}
                    disabled={!isOnline}
                  >
                    <HStack className="items-center">
                      <Sparkles size={24} color={gray200} />
                      <Text className="ml-4 text-lg text-gray-200">
                        {t("app.tracks.similarSongs")}
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
                )}
                {capabilities.sharing && (
                  <FadeOutScaleDown
                    onPress={handleSharePress}
                    disabled={!isOnline}
                  >
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
                <FadeOutScaleDown
                  onPress={handleDownloadPress}
                  disabled={!isOnline}
                >
                  <HStack className="items-center">
                    <Download size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.download")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                {hasCredits && (
                  <FadeOutScaleDown onPress={handleCreditsPress}>
                    <HStack className="items-center">
                      <ListMusic size={24} color={gray200} />
                      <Text className="ml-4 text-lg text-gray-200">
                        {t("app.tracks.showCredits")}
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
                )}
                {track?.musicBrainzId && (
                  <FadeOutScaleDown
                    onPress={handleMusicBrainzPress}
                    disabled={!isOnline}
                  >
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
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
      <RatingModal
        isOpen={showRatingModal}
        onClose={handleCloseRatingModal}
        title={t("app.tracks.rateModalTitle")}
        value={track?.userRating || 0}
        onConfirm={handleRatingChange}
        isPending={doSetRating.isPending}
        closeButtonTestID="track-rating-close-button"
      />
      <TrackInfoModal
        isOpen={showInfoModal}
        onClose={handleCloseInfoModal}
        track={track}
      />
      <Modal
        isOpen={showCreditsModal}
        onClose={handleCloseCreditsModal}
        closeOnOverlayClick
      >
        <ModalBackdrop />
        <ModalContent
          className="bg-primary-800 border-primary-600 max-h-[80%]"
          style={{ marginBottom: insets.bottom, marginTop: insets.top }}
        >
          <ModalHeader>
            <Heading className="text-white">
              {t("app.tracks.creditsModalTitle")}
            </Heading>
            <ModalCloseButton testID="track-credits-close-button">
              <Icon as={X} size="md" className="color-white" />
            </ModalCloseButton>
          </ModalHeader>
          <ModalBody className="mb-0 pb-0" showsVerticalScrollIndicator={false}>
            {track && (
              <VStack className="gap-y-2">
                {track.displayAlbumArtist && (
                  <VStack className="border-b border-primary-600 py-2">
                    <Text className="text-primary-100 text-sm">
                      {t("app.tracks.creditsModal.albumArtist")}
                    </Text>
                    <Text className="text-white">
                      {track.displayAlbumArtist}
                    </Text>
                  </VStack>
                )}
                {track.displayComposer && (
                  <VStack className="border-b border-primary-600 py-2">
                    <Text className="text-primary-100 text-sm">
                      {t("app.tracks.creditsModal.composer")}
                    </Text>
                    <Text className="text-white">{track.displayComposer}</Text>
                  </VStack>
                )}
                {track.contributors?.map((contributor, index) => (
                  <VStack
                    key={`${contributor.role}-${contributor.artist.id}-${index}`}
                    className="border-b border-primary-600 py-2"
                  >
                    <Text className="text-primary-100 text-sm">
                      {contributor.subRole
                        ? `${contributor.role} · ${contributor.subRole}`
                        : contributor.role}
                    </Text>
                    <Text className="text-white">
                      {contributor.artist.name}
                    </Text>
                  </VStack>
                ))}
              </VStack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </TrackActionsContext.Provider>
  );
}
