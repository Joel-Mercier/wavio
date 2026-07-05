import {
  BottomSheetBackdrop,
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useQueryClient } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import BookmarkPlus from "lucide-react-native/dist/esm/icons/bookmark-plus.mjs";
import CircleMinus from "lucide-react-native/dist/esm/icons/circle-minus.mjs";
import PlusCircle from "lucide-react-native/dist/esm/icons/circle-plus.mjs";
import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import Download from "lucide-react-native/dist/esm/icons/download.mjs";
import Info from "lucide-react-native/dist/esm/icons/info.mjs";
import ListPlus from "lucide-react-native/dist/esm/icons/list-plus.mjs";
import ListStart from "lucide-react-native/dist/esm/icons/list-start.mjs";
import Mic2 from "lucide-react-native/dist/esm/icons/mic-vocal.mjs";
import PodcastIcon from "lucide-react-native/dist/esm/icons/podcast.mjs";
import RadioIcon from "lucide-react-native/dist/esm/icons/radio.mjs";
import Share2 from "lucide-react-native/dist/esm/icons/share-2.mjs";
import Sparkles from "lucide-react-native/dist/esm/icons/sparkles.mjs";
import Timer from "lucide-react-native/dist/esm/icons/timer.mjs";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import Share from "react-native-share";
import { Uniwind } from "uniwind";
import MusicBrainz from "@/assets/images/musicbrainz.svg";
import BottomSheetModalComponent from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import InternetRadioStationActions from "@/components/internetRadioStations/InternetRadioStationActions";
import ShareLinkSheet from "@/components/player/ShareLinkSheet";
import TrackInfoModal from "@/components/tracks/TrackInfoModal";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { useCreateShare } from "@/hooks/backend/useSharing";
import {
  useIsCollectionAvailableOffline,
  useIsDetailCached,
} from "@/hooks/offline";
import { usePlaybackProgress } from "@/hooks/player";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useIsOnline } from "@/hooks/useIsOnline";
import { getCurrentTime } from "@/services/player";
import { saveTrackToDevice } from "@/services/saveTrackToDevice";
import { useSleepTimer } from "@/services/sleepTimer";
import useApp from "@/stores/app";
import useBookmarks from "@/stores/bookmarks";
import usePodcasts from "@/stores/podcasts";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { formatSeconds } from "@/utils/date";
import { formatRichTextPlain } from "@/utils/formatRichText";
import { logError } from "@/utils/log";

// Live label for the "set bookmark at" action. Isolated in its own component so
// only this row re-renders on the ~4 Hz progress tick (it's only mounted while
// the action sheet is open).
function SetBookmarkLabel() {
  const { t } = useTranslation();
  const { currentTime } = usePlaybackProgress();
  return (
    <Text className="ml-4 text-lg text-gray-200">
      {t("app.player.setBookmarkAt", { time: formatSeconds(currentTime) })}
    </Text>
  );
}

// The player screen's bottom sheets (track actions, sleep timer, artist picker,
// share link). The parent owns the actions sheet ref since its trigger lives in
// the player chrome. The jukebox sheet lives app-wide (see JukeboxSheet in
// app/(app)/_layout).
export default function PlayerSheets({
  actionsSheetRef,
  playingTrack,
  hideLyricsAction,
  onAddFavoritePodcast,
  onRemoveFavoritePodcast,
}: {
  actionsSheetRef: RefObject<BottomSheetModal | null>;
  playingTrack: QueueTrack | null;
  hideLyricsAction?: boolean;
  onAddFavoritePodcast?: () => void;
  onRemoveFavoritePodcast?: () => void;
}) {
  const [emerald500, white, gray200] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-white",
    "--color-gray-200",
  ]) as string[];
  const { t } = useTranslation();
  const capabilities = useCapabilities();
  const isOnline = useIsOnline();
  const lyricsSource = useApp((s) => s.lyricsSource);
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [shareUrl, setShareUrl] = useState("");
  const [showInfoModal, setShowInfoModal] = useState(false);
  const sleepTimerSheetRef = useRef<BottomSheetModal>(null);
  const bottomSheetArtistsModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetShareModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(actionsSheetRef);
  const { handleSheetPositionChange: handleSleepSheetPositionChange } =
    useBottomSheetBackHandler(sleepTimerSheetRef);
  const { handleSheetPositionChange: handleArtistsSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetArtistsModalRef);
  const sleepEndsAt = useSleepTimer((s) => s.endsAt);
  const sleepEndOfTrack = useSleepTimer((s) => s.endOfTrack);
  const setSleepMinutes = useSleepTimer((s) => s.setMinutes);
  const setSleepEndOfTrack = useSleepTimer((s) => s.setEndOfTrack);
  const cancelSleepTimer = useSleepTimer((s) => s.cancel);
  const sleepActive = sleepEndsAt != null || sleepEndOfTrack;
  const [sleepNow, setSleepNow] = useState(() => Date.now());
  useEffect(() => {
    if (sleepEndsAt == null) return;
    const id = setInterval(() => setSleepNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sleepEndsAt]);
  const sleepRemainingLabel = (() => {
    if (sleepEndOfTrack) return t("app.player.sleepTimerEndOfTrack");
    if (sleepEndsAt == null) return null;
    const remaining = Math.max(0, sleepEndsAt - sleepNow);
    const totalSec = Math.ceil(remaining / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  })();
  const doShare = useCreateShare();
  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();

  const isRadio = !!playingTrack?.isRadio;
  const isPodcast = playingTrack?.source === "podcast";
  const podcastSeries = isPodcast ? playingTrack?.podcastSeries : null;
  const isPodcastFavorite = usePodcasts((store) =>
    podcastSeries
      ? store.favoritePodcasts.some((fav) => fav.uuid === podcastSeries.uuid)
      : false,
  );

  const trackArtists: { id: string; name: string }[] = playingTrack?.artists
    ?.length
    ? playingTrack.artists
    : playingTrack?.artistId
      ? [{ id: playingTrack.artistId, name: playingTrack.artist ?? "" }]
      : [];
  const hasMultipleArtists = trackArtists.length > 1;
  const primaryArtistId = trackArtists[0]?.id ?? playingTrack?.artistId;
  const albumDetailCached = useIsDetailCached(
    playingTrack?.albumId ? ["album", playingTrack.albumId] : null,
  );
  const albumDownloaded = useIsCollectionAvailableOffline(
    "album",
    playingTrack?.albumId,
  );
  const albumReachable = albumDetailCached || albumDownloaded;
  const artistReachable = useIsDetailCached(
    primaryArtistId ? ["artist", primaryArtistId] : null,
  );

  const handleSetBookmarkPress = () => {
    actionsSheetRef.current?.dismiss();
    if (!playingTrack?.id) return;
    // Read the live position at press time so the saved bookmark matches what
    // the dynamic label was showing.
    useBookmarks.getState().addBookmark(playingTrack.id, getCurrentTime());
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>{t("app.player.bookmarkAdded")}</ToastDescription>
        </Toast>
      ),
    });
  };

  const handleGoToArtistPress = () => {
    actionsSheetRef.current?.dismiss();
    if (hasMultipleArtists) {
      bottomSheetArtistsModalRef.current?.present();
      return;
    }
    const artistId = trackArtists[0]?.id ?? playingTrack?.artistId;
    if (artistId) {
      router.replace(`/artists/${artistId}`);
    }
  };

  const handleArtistPickPress = (artistId: string) => {
    bottomSheetArtistsModalRef.current?.dismiss();
    router.replace(`/artists/${artistId}`);
  };

  const handleGoToAlbumPress = () => {
    actionsSheetRef.current?.dismiss();
    if (!playingTrack?.albumId) return;
    router.replace(`/albums/${playingTrack.albumId}`);
  };

  const handleMusicBrainzPress = async () => {
    actionsSheetRef.current?.dismiss();
    if (
      playingTrack?.musicBrainzId &&
      (await Linking.canOpenURL(
        `https://musicbrainz.org/recording/${playingTrack?.musicBrainzId}`,
      ))
    ) {
      Linking.openURL(
        `https://musicbrainz.org/recording/${playingTrack?.musicBrainzId}`,
      );
    }
  };

  const handleShowLyricsPress = () => {
    actionsSheetRef.current?.dismiss();
    router.push("/lyrics");
  };

  const handleInfoPress = () => {
    actionsSheetRef.current?.dismiss();
    setShowInfoModal(true);
  };

  const handleCloseInfoModal = () => setShowInfoModal(false);

  const handleSimilarSongsPress = () => {
    if (!playingTrack) return;
    actionsSheetRef.current?.dismiss();
    router.replace({
      pathname: "/tracks/[id]/similar",
      params: { id: playingTrack.id, title: playingTrack.title ?? "" },
    });
  };

  const handlePlayNextPress = () => {
    if (!playingTrack) return;
    useQueue.getState().enqueueNext(playingTrack);
    actionsSheetRef.current?.dismiss();
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
    if (!playingTrack) return;
    useQueue.getState().enqueueEnd(playingTrack);
    actionsSheetRef.current?.dismiss();
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

  const handleSleepTimerPress = () => {
    actionsSheetRef.current?.dismiss();
    sleepTimerSheetRef.current?.present();
  };

  const handleSleepPresetPress = (minutes: number) => {
    setSleepMinutes(minutes);
    sleepTimerSheetRef.current?.dismiss();
  };

  const handleSleepEndOfTrackPress = () => {
    setSleepEndOfTrack();
    sleepTimerSheetRef.current?.dismiss();
  };

  const handleSleepCancelPress = () => {
    cancelSleepTimer();
    sleepTimerSheetRef.current?.dismiss();
  };

  const handleGoToPodcastSeriesPress = () => {
    actionsSheetRef.current?.dismiss();
    if (!podcastSeries) return;
    router.navigate({
      pathname: "/podcast-series/[id]",
      params: {
        id: podcastSeries.uuid,
        uuid: podcastSeries.uuid,
        name: podcastSeries.name,
        description: podcastSeries.description,
        imageUrl: podcastSeries.imageUrl,
        authorName: podcastSeries.authorName,
        genres: podcastSeries.genres?.join(","),
      },
    });
  };

  const handleSharePodcastEpisodePress = async () => {
    actionsSheetRef.current?.dismiss();
    if (!playingTrack) return;
    try {
      const plain = formatRichTextPlain(playingTrack.description);
      const excerpt =
        plain.length > 240 ? `${plain.slice(0, 240).trimEnd()}…` : plain;
      const message = [playingTrack.title, excerpt]
        .filter(Boolean)
        .join("\n\n");

      const linkUrl =
        playingTrack.websiteUrl ||
        playingTrack.podcastSeries?.websiteUrl ||
        undefined;

      if (linkUrl) {
        await Share.open({
          title: playingTrack.title,
          message,
          url: linkUrl,
          failOnCancel: false,
        });
        return;
      }

      let localImageUri: string | undefined;
      if (playingTrack.artwork) {
        try {
          const ext = playingTrack.artwork.split("?")[0].split(".").pop();
          const safeExt = ext && ext.length <= 5 ? ext : "jpg";
          const fileName = `podcast-share-${playingTrack.id}.${safeExt}`;
          const dest = new File(Paths.cache, fileName);
          if (dest.exists) dest.delete();
          const downloaded = await File.downloadFileAsync(
            playingTrack.artwork,
            dest,
          );
          localImageUri = downloaded.uri;
        } catch (e) {
          console.warn("Failed to download podcast cover for sharing", e);
        }
      }

      await Share.open({
        title: playingTrack.title,
        message,
        ...(localImageUri ? { url: localImageUri, type: "image/jpeg" } : {}),
        failOnCancel: false,
      });
    } catch (error) {
      logError(error);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.podcasts.shareErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  const handleAddToPlaylistPress = () => {
    if (!playingTrack) return;
    actionsSheetRef.current?.dismiss();
    router.replace({
      pathname: "/playlists/add-to-playlist",
      params: { ids: [playingTrack.id] },
    });
  };

  const handleSharePress = () => {
    if (!playingTrack) return;
    doShare.mutate(
      { id: playingTrack.id },
      {
        onSuccess: (data) => {
          actionsSheetRef.current?.dismiss();
          setShareUrl(data?.shares?.share?.[0]?.url ?? "");
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

  const handleDownloadPress = async () => {
    actionsSheetRef.current?.dismiss();
    if (!playingTrack) return;
    if (permissionResponse?.status !== "granted") {
      await requestPermission();
    }
    try {
      await saveTrackToDevice(playingTrack);
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

  return (
    <>
      <BottomSheetModalComponent
        ref={actionsSheetRef}
        onChange={handleSheetPositionChange}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
          <Box className="p-6 w-full mb-12">
            <HStack className="items-center">
              <ImageWithFallback
                source={
                  playingTrack?.artwork
                    ? { uri: playingTrack.artwork }
                    : undefined
                }
                className="w-16 h-16 rounded-md aspect-square"
                alt="Track cover"
                contentFit={isRadio ? "contain" : "cover"}
                fallback={
                  <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                    {isRadio ? (
                      <RadioIcon size={24} color={white} />
                    ) : (
                      <AudioLines size={24} color={white} />
                    )}
                  </Box>
                }
              />
              <VStack className="ml-4 flex-1">
                <Heading
                  className="text-white font-normal"
                  size="lg"
                  numberOfLines={1}
                >
                  {playingTrack?.title}
                </Heading>
                {!isRadio && !isPodcast && (
                  <Text numberOfLines={1} className="text-md text-primary-100">
                    {playingTrack?.artist || t("app.shared.unknownArtist")} ⦁{" "}
                    {playingTrack?.album || t("app.shared.unknownAlbum")}
                  </Text>
                )}
                {isPodcast && (
                  <Text numberOfLines={1} className="text-md text-primary-100">
                    {playingTrack?.artist}
                  </Text>
                )}
                {isRadio && (
                  <Text numberOfLines={1} className="text-md text-primary-100">
                    {playingTrack?.streamUrl}
                  </Text>
                )}
              </VStack>
            </HStack>
            {isRadio ? (
              <InternetRadioStationActions
                id={playingTrack?.id ?? ""}
                name={playingTrack?.title ?? ""}
                streamUrl={playingTrack?.streamUrl ?? playingTrack?.url ?? ""}
                homePageUrl={playingTrack?.homePageUrl}
                source={
                  playingTrack?.source === "radioBrowser"
                    ? "radioBrowser"
                    : "server"
                }
                onActionStart={() => actionsSheetRef.current?.dismiss()}
                onDeleted={() => {
                  if (router.canGoBack()) router.back();
                  else router.replace("/");
                }}
              />
            ) : isPodcast ? (
              <VStack className="mt-6 gap-y-8">
                {podcastSeries && (
                  <FadeOutScaleDown onPress={handleGoToPodcastSeriesPress}>
                    <HStack className="items-center">
                      <PodcastIcon size={24} color={gray200} />
                      <Text className="ml-4 text-lg text-gray-200">
                        {t("app.podcasts.goToPodcastSeries")}
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
                )}
                {podcastSeries &&
                  (isPodcastFavorite ? (
                    <FadeOutScaleDown onPress={onRemoveFavoritePodcast}>
                      <HStack className="items-center">
                        <CircleMinus size={24} color={gray200} />
                        <Text className="ml-4 text-lg text-gray-200">
                          {t("app.podcasts.removeFromFavorites")}
                        </Text>
                      </HStack>
                    </FadeOutScaleDown>
                  ) : (
                    <FadeOutScaleDown onPress={onAddFavoritePodcast}>
                      <HStack className="items-center">
                        <PlusCircle size={24} color={gray200} />
                        <Text className="ml-4 text-lg text-gray-200">
                          {t("app.podcasts.addToFavorites")}
                        </Text>
                      </HStack>
                    </FadeOutScaleDown>
                  ))}
                <FadeOutScaleDown onPress={handleSharePodcastEpisodePress}>
                  <HStack className="items-center">
                    <Share2 size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.share")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={handleSleepTimerPress}>
                  <HStack className="items-center">
                    <Timer
                      size={24}
                      color={sleepActive ? emerald500 : gray200}
                    />
                    <Text
                      className="ml-4 text-lg"
                      style={{
                        color: sleepActive ? emerald500 : gray200,
                      }}
                    >
                      {sleepActive && sleepRemainingLabel
                        ? t("app.player.sleepTimerActive", {
                            label: sleepRemainingLabel,
                          })
                        : t("app.player.sleepTimer")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              </VStack>
            ) : (
              <VStack className="mt-6 gap-y-8">
                <FadeOutScaleDown
                  onPress={handleAddToPlaylistPress}
                  disabled={!isOnline}
                >
                  <HStack className="items-center">
                    <PlusCircle size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.addToPlaylist")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
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
                {playingTrack?.albumId && (
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
                      {t("app.player.playNext")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={handleAddToQueuePress}>
                  <HStack className="items-center">
                    <ListPlus size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.player.addToQueue")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={handleSetBookmarkPress}>
                  <HStack className="items-center">
                    <BookmarkPlus size={24} color={gray200} />
                    <SetBookmarkLabel />
                  </HStack>
                </FadeOutScaleDown>
                {!hideLyricsAction && lyricsSource !== "off" && (
                  <FadeOutScaleDown onPress={handleShowLyricsPress}>
                    <HStack className="items-center">
                      <Mic2 size={24} color={gray200} />
                      <Text className="ml-4 text-lg text-gray-200">
                        {t("app.player.lyrics")}
                      </Text>
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
                <FadeOutScaleDown onPress={handleSleepTimerPress}>
                  <HStack className="items-center">
                    <Timer
                      size={24}
                      color={sleepActive ? emerald500 : gray200}
                    />
                    <Text
                      className="ml-4 text-lg"
                      style={{
                        color: sleepActive ? emerald500 : gray200,
                      }}
                    >
                      {sleepActive && sleepRemainingLabel
                        ? t("app.player.sleepTimerActive", {
                            label: sleepRemainingLabel,
                          })
                        : t("app.player.sleepTimer")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                {playingTrack?.musicBrainzId && (
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
            )}
          </Box>
        </BottomSheetScrollView>
      </BottomSheetModalComponent>
      <BottomSheetModalComponent
        ref={sleepTimerSheetRef}
        onChange={handleSleepSheetPositionChange}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
          <Box className="p-6 w-full mb-12">
            <HStack className="items-center mb-6">
              <Timer size={24} color={gray200} />
              <Heading
                className="ml-4 text-white font-normal"
                size="lg"
                numberOfLines={1}
              >
                {t("app.player.sleepTimer")}
              </Heading>
            </HStack>
            <VStack className="gap-y-6">
              <FadeOutScaleDown onPress={handleSleepCancelPress}>
                <Text
                  className="text-lg"
                  style={{
                    color: !sleepActive ? emerald500 : gray200,
                  }}
                >
                  {t("app.player.sleepTimerOff")}
                </Text>
              </FadeOutScaleDown>
              {[5, 10, 15, 30, 45, 60].map((minutes) => {
                const active =
                  !sleepEndOfTrack &&
                  sleepEndsAt != null &&
                  Math.round((sleepEndsAt - Date.now()) / 60000) === minutes;
                return (
                  <FadeOutScaleDown
                    key={minutes}
                    onPress={() => handleSleepPresetPress(minutes)}
                  >
                    <Text
                      className="text-lg"
                      style={{
                        color: active ? emerald500 : gray200,
                      }}
                    >
                      {t("app.player.sleepTimerMinutes", { count: minutes })}
                    </Text>
                  </FadeOutScaleDown>
                );
              })}
              <FadeOutScaleDown onPress={handleSleepEndOfTrackPress}>
                <Text
                  className="text-lg"
                  style={{
                    color: sleepEndOfTrack ? emerald500 : gray200,
                  }}
                >
                  {t("app.player.sleepTimerEndOfTrack")}
                </Text>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetScrollView>
      </BottomSheetModalComponent>
      <BottomSheetModalComponent
        ref={bottomSheetArtistsModalRef}
        onChange={handleArtistsSheetPositionChange}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
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
      </BottomSheetModalComponent>
      <ShareLinkSheet sheetRef={bottomSheetShareModalRef} url={shareUrl} />
      <TrackInfoModal
        isOpen={showInfoModal}
        onClose={handleCloseInfoModal}
        track={playingTrack}
      />
    </>
  );
}
