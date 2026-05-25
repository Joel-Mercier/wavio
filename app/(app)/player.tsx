import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Directory, File, Paths } from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import ChevronDown from "lucide-react-native/dist/esm/icons/chevron-down.mjs";
import CircleMinus from "lucide-react-native/dist/esm/icons/circle-minus.mjs";
import PlusCircle from "lucide-react-native/dist/esm/icons/circle-plus.mjs";
import ClipboardIcon from "lucide-react-native/dist/esm/icons/clipboard.mjs";
import ClipboardCheck from "lucide-react-native/dist/esm/icons/clipboard-check.mjs";
import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import Download from "lucide-react-native/dist/esm/icons/download.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Heart from "lucide-react-native/dist/esm/icons/heart.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import ListPlus from "lucide-react-native/dist/esm/icons/list-plus.mjs";
import ListStart from "lucide-react-native/dist/esm/icons/list-start.mjs";
import Mic2 from "lucide-react-native/dist/esm/icons/mic-vocal.mjs";
import Pause from "lucide-react-native/dist/esm/icons/pause.mjs";
import Play from "lucide-react-native/dist/esm/icons/play.mjs";
import PodcastIcon from "lucide-react-native/dist/esm/icons/podcast.mjs";
import RadioIcon from "lucide-react-native/dist/esm/icons/radio.mjs";
import Repeat from "lucide-react-native/dist/esm/icons/repeat.mjs";
import Repeat1 from "lucide-react-native/dist/esm/icons/repeat-1.mjs";
import Share2 from "lucide-react-native/dist/esm/icons/share-2.mjs";
import Shuffle from "lucide-react-native/dist/esm/icons/shuffle.mjs";
import SkipBack from "lucide-react-native/dist/esm/icons/skip-back.mjs";
import SkipForward from "lucide-react-native/dist/esm/icons/skip-forward.mjs";
import Sparkles from "lucide-react-native/dist/esm/icons/sparkles.mjs";
import Speaker from "lucide-react-native/dist/esm/icons/speaker.mjs";
import Timer from "lucide-react-native/dist/esm/icons/timer.mjs";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Image as RNImage } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Share from "react-native-share";
import {
  CastButton,
  useCastSession,
  useMediaStatus,
} from "react-native-google-cast";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Uniwind } from "uniwind";
import MusicBrainz from "@/assets/images/musicbrainz.svg";
import FadeOut from "@/components/FadeOut";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import InternetRadioStationActions from "@/components/internetRadioStations/InternetRadioStationActions";
import CurrentLyricLine from "@/components/player/CurrentLyricLine";
import LyricsDialog from "@/components/player/LyricsDialog";
import PlaybackSlider from "@/components/player/PlaybackSlider";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import {
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
} from "@/components/ui/slider";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { useStar, useUnstar } from "@/hooks/backend/useMediaAnnotation";
import { useCreateShare } from "@/hooks/backend/useSharing";
import { useIsPlaying, usePlayingTrack, useSyncedLyrics } from "@/hooks/player";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { useCapabilities } from "@/hooks/useCapabilities";
import useImageColors from "@/hooks/useImageColors";
import {
  activate as activateJukebox,
  deactivate as deactivateJukebox,
  jukeboxSetGain,
} from "@/services/jukebox";
import {
  getCurrentTime,
  isPlaying as isLocalPlaying,
  pause as pauseLocal,
  play as playLocal,
  seekTo as seekLocal,
  skipNext,
  skipPrevious,
  togglePlayPause,
} from "@/services/player";
import { useSleepTimer } from "@/services/sleepTimer";
import useJukebox from "@/stores/jukebox";
import usePodcasts from "@/stores/podcasts";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { formatRichTextPlain } from "@/utils/formatRichText";
import { downloadUrl, streamUrl } from "@/utils/streaming";

const COVER_SWIPE_THRESHOLD = 80;
const COVER_SWIPE_BUFFER = 60;

function CoverSlot({
  track,
  size,
}: {
  track: QueueTrack | null;
  size: number;
}) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  if (!size) return null;
  if (track?.artwork) {
    return (
      <RNImage
        source={{ uri: track.artwork }}
        style={{ width: size, height: size, borderRadius: 6 }}
        resizeMode={track.isRadio ? "contain" : "cover"}
      />
    );
  }
  return (
    <Box
      style={{ width: size, height: size }}
      className="rounded-md bg-primary-600 items-center justify-center"
    >
      {track?.isRadio ? (
        <RadioIcon size={64} color={white} />
      ) : (
        <AudioLines size={64} color={white} />
      )}
    </Box>
  );
}

export default function PlayerScreen() {
  const [blue500, emerald500, gray800, white, gray200] = Uniwind.getCSSVariable(
    [
      "--color-blue-500",
      "--color-emerald-500",
      "--color-gray-800",
      "--color-white",
      "--color-gray-200",
    ],
  ) as string[];
  const { t } = useTranslation();
  const capabilities = useCapabilities();
  const [showRatingModal, setShowRatingModal] = useState<boolean>(false);
  const [clipboardText, setClipboardText] = useState("");
  const [clipoardCopyDone, setClipoardCopyDone] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const sleepTimerSheetRef = useRef<BottomSheetModal>(null);
  const bottomSheetArtistsModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetShareModalRef = useRef<BottomSheetModal>(null);
  const jukeboxSheetRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const { handleSheetPositionChange: handleSleepSheetPositionChange } =
    useBottomSheetBackHandler(sleepTimerSheetRef);
  const { handleSheetPositionChange: handleArtistsSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetArtistsModalRef);
  const { handleSheetPositionChange: handleShareSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetShareModalRef);
  const { handleSheetPositionChange: handleJukeboxSheetPositionChange } =
    useBottomSheetBackHandler(jukeboxSheetRef);
  const jukeboxActive = useJukebox((s) => s.active);
  const jukeboxGain = useJukebox((s) => s.gain);
  const jukeboxStatus = useJukebox((s) => s.status);
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
  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const colors = useImageColors(playingTrack?.artwork);
  const doFavorite = useStar();
  const doUnfavorite = useUnstar();
  const doShare = useCreateShare();
  const repeatMode = useQueue((store) => store.repeatMode);
  const setRepeatMode = useQueue((store) => store.setRepeatMode);
  const shuffle = useQueue((store) => store.shuffle);
  const setShuffle = useQueue((store) => store.setShuffle);
  const queue = useQueue((store) => store.queue);
  const currentIndex = useQueue((store) => store.currentIndex);
  const queueLength = queue.length;
  const isRadio = !!playingTrack?.isRadio;
  const isPodcast = playingTrack?.source === "podcast";
  const podcastSeries = isPodcast ? playingTrack?.podcastSeries : null;
  const addFavoritePodcast = usePodcasts((store) => store.addFavoritePodcast);
  const removeFavoritePodcast = usePodcasts(
    (store) => store.removeFavoritePodcast,
  );
  const isPodcastFavorite = usePodcasts((store) =>
    podcastSeries
      ? store.favoritePodcasts.some((fav) => fav.uuid === podcastSeries.uuid)
      : false,
  );
  const canSkipNext =
    !isRadio &&
    (shuffle ||
      repeatMode !== "off" ||
      (currentIndex != null && currentIndex < queueLength - 1));
  const canSkipPrevious =
    !isRadio &&
    (shuffle ||
      repeatMode !== "off" ||
      (currentIndex != null && currentIndex > 0));
  const prevTrack =
    currentIndex != null && currentIndex > 0 ? queue[currentIndex - 1] : null;
  const nextTrack =
    currentIndex != null && currentIndex < queueLength - 1
      ? queue[currentIndex + 1]
      : null;
  const [coverWidth, setCoverWidth] = useState(0);
  const [showLyricsDialog, setShowLyricsDialog] = useState(false);
  const { lyrics } = useSyncedLyrics(playingTrack);
  const hasSyncedLyrics = !!lyrics && lyrics.line.length > 0;
  const coverTranslateX = useSharedValue(0);

  const coverRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: coverTranslateX.value }],
  }));

  const coverPanGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      let tx = e.translationX;
      if (tx > 0 && !canSkipPrevious) return;
      if (tx < 0 && !canSkipNext) return;
      const max = coverWidth + COVER_SWIPE_BUFFER;
      if (tx > max) tx = max;
      if (tx < -max) tx = -max;
      coverTranslateX.value = tx;
    })
    .onEnd((e) => {
      if (e.translationX <= -COVER_SWIPE_THRESHOLD && canSkipNext) {
        coverTranslateX.value = withTiming(
          -coverWidth,
          { duration: 200 },
          (finished) => {
            if (finished) {
              coverTranslateX.value = 0;
              scheduleOnRN(skipNext);
            }
          },
        );
      } else if (e.translationX >= COVER_SWIPE_THRESHOLD && canSkipPrevious) {
        coverTranslateX.value = withTiming(
          coverWidth,
          { duration: 200 },
          (finished) => {
            if (finished) {
              coverTranslateX.value = 0;
              scheduleOnRN(skipPrevious, { force: true });
            }
          },
        );
      } else {
        coverTranslateX.value = withTiming(0, { duration: 200 });
      }
    });
  const toast = useToast();
  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();
  const castSession = useCastSession();
  const castClient = castSession?.client ?? null;
  const castMediaStatus = useMediaStatus();
  const previousSessionIdRef = useRef<string | null>(null);
  const wasPlayingBeforeCastRef = useRef(false);
  const lastReceiverPositionRef = useRef(0);
  const lastLoadedCastTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    const pos = castMediaStatus?.streamPosition;
    if (typeof pos === "number" && Number.isFinite(pos)) {
      lastReceiverPositionRef.current = pos;
    }
  }, [castMediaStatus?.streamPosition]);

  useEffect(() => {
    const currentSessionId = castSession?.id ?? null;
    const previousSessionId = previousSessionIdRef.current;
    if (currentSessionId === previousSessionId) return;
    previousSessionIdRef.current = currentSessionId;

    if (currentSessionId && !previousSessionId) {
      wasPlayingBeforeCastRef.current = isLocalPlaying();
      const localPos = getCurrentTime();
      pauseLocal();
      if (castClient && playingTrack) {
        const contentUrl = isRadio
          ? (playingTrack.streamUrl ?? playingTrack.url)
          : streamUrl(playingTrack.id);
        if (contentUrl) {
          lastLoadedCastTrackIdRef.current = playingTrack.id;
          castClient.loadMedia({
            autoplay: wasPlayingBeforeCastRef.current,
            startTime: isRadio ? undefined : localPos,
            mediaInfo: {
              contentUrl,
              contentType: "audio/mpeg",
              metadata: {
                type: "musicTrack",
                title: playingTrack.title,
                albumTitle: playingTrack.album,
                artist: playingTrack.artist,
                images: playingTrack.artwork
                  ? [{ url: playingTrack.artwork }]
                  : undefined,
              },
              streamDuration: playingTrack.duration,
            },
          });
        }
      }
    } else if (!currentSessionId && previousSessionId) {
      const resumePos = lastReceiverPositionRef.current;
      lastLoadedCastTrackIdRef.current = null;
      if (!isRadio && resumePos > 0) seekLocal(resumePos);
      if (wasPlayingBeforeCastRef.current) playLocal();
      wasPlayingBeforeCastRef.current = false;
      lastReceiverPositionRef.current = 0;
    }
  }, [castSession, castClient, playingTrack, isRadio]);

  useEffect(() => {
    if (!castClient || !castSession || !playingTrack) return;
    if (lastLoadedCastTrackIdRef.current === playingTrack.id) return;
    const contentUrl = isRadio
      ? (playingTrack.streamUrl ?? playingTrack.url)
      : streamUrl(playingTrack.id);
    if (!contentUrl) return;
    lastLoadedCastTrackIdRef.current = playingTrack.id;
    castClient.loadMedia({
      mediaInfo: {
        contentUrl,
        contentType: "audio/mpeg",
        metadata: {
          type: "musicTrack",
          title: playingTrack.title,
          albumTitle: playingTrack.album,
          artist: playingTrack.artist,
          images: playingTrack.artwork
            ? [{ url: playingTrack.artwork }]
            : undefined,
        },
        streamDuration: playingTrack.duration,
      },
    });
  }, [castClient, castSession, playingTrack, isRadio]);

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const trackArtists: { id: string; name: string }[] = playingTrack?.artists
    ?.length
    ? playingTrack.artists
    : playingTrack?.artistId
      ? [{ id: playingTrack.artistId, name: playingTrack.artist ?? "" }]
      : [];
  const hasMultipleArtists = trackArtists.length > 1;

  const handleGoToArtistPress = () => {
    bottomSheetModalRef.current?.dismiss();
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
    bottomSheetModalRef.current?.dismiss();
    if (!playingTrack?.albumId) return;
    router.replace(`/albums/${playingTrack.albumId}`);
  };

  const handleMusicBrainzPress = async () => {
    bottomSheetModalRef.current?.dismiss();
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
    bottomSheetModalRef.current?.dismiss();
    setShowLyricsDialog(true);
  };

  const handleSimilarSongsPress = () => {
    if (!playingTrack) return;
    bottomSheetModalRef.current?.dismiss();
    router.replace({
      pathname: "/tracks/[id]/similar",
      params: { id: playingTrack.id, title: playingTrack.title ?? "" },
    });
  };

  const handlePlayNextPress = () => {
    if (!playingTrack) return;
    useQueue.getState().enqueueNext(playingTrack);
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
    if (!playingTrack) return;
    useQueue.getState().enqueueEnd(playingTrack);
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

  const handleSleepTimerPress = () => {
    bottomSheetModalRef.current?.dismiss();
    sleepTimerSheetRef.current?.present();
  };

  const handleJukeboxPress = () => {
    jukeboxSheetRef.current?.present();
  };

  const handleJukeboxToggle = async () => {
    if (jukeboxActive) {
      try {
        const { position } = await deactivateJukebox();
        if (position > 0) seekLocal(position);
      } catch (e) {
        console.error(e);
      }
      jukeboxSheetRef.current?.dismiss();
      return;
    }
    const position = getCurrentTime();
    const wasPlaying = isLocalPlaying();
    pauseLocal();
    try {
      await activateJukebox({ position, autoplay: wasPlaying });
    } catch (error) {
      console.error(error);
      if (wasPlaying) playLocal();
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.player.jukeboxErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  const handleJukeboxGainChange = (value: number) => {
    jukeboxSetGain(value / 100).catch(() => {});
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
    bottomSheetModalRef.current?.dismiss();
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

  const handleAddFavoritePodcastPress = () => {
    bottomSheetModalRef.current?.dismiss();
    if (!podcastSeries) return;
    addFavoritePodcast(podcastSeries);
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {t("app.podcasts.addToFavoritesSuccessMessage")}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  const handleRemoveFavoritePodcastPress = () => {
    bottomSheetModalRef.current?.dismiss();
    if (!podcastSeries) return;
    removeFavoritePodcast(podcastSeries.uuid);
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {t("app.podcasts.removeFromFavoritesSuccessMessage")}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  const handleSharePodcastEpisodePress = async () => {
    bottomSheetModalRef.current?.dismiss();
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
      console.error(error);
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
    bottomSheetModalRef.current?.dismiss();
    router.replace({
      pathname: "/playlists/add-to-playlist",
      params: { ids: [playingTrack.id] },
    });
  };

  const handlePlayPausePress = () => {
    togglePlayPause();
  };

  const handleNextPress = () => {
    skipNext();
  };

  const handlePreviousPress = () => {
    skipPrevious();
  };

  const handleFavoritePress = () => {
    if (!playingTrack?.id) return;
    const trackId = playingTrack.id;
    doFavorite.mutate(
      { id: trackId },
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
    if (!playingTrack?.id) return;
    const trackId = playingTrack.id;
    doUnfavorite.mutate(
      { id: trackId },
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

  const handleRepeatModePress = (newRepeatMode: typeof repeatMode) => {
    setRepeatMode(newRepeatMode);
  };

  const handleShufflePress = (enabled: boolean) => {
    setShuffle(enabled);
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

  const handleSharePress = () => {
    if (!playingTrack) return;
    doShare.mutate(
      { id: playingTrack.id },
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

  const handleDownloadPress = async () => {
    bottomSheetModalRef.current?.dismiss();
    if (!playingTrack) return;
    if (permissionResponse?.status !== "granted") {
      await requestPermission();
    }
    const url = downloadUrl(playingTrack.id);
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

  return (
    <LinearGradient
      colors={[
        (colors?.platform === "ios" ? colors.primary : colors?.lightMuted) ||
          blue500,
        "#191A1F",
      ]}
      locations={[0, 0.7]}
    >
      <SafeAreaView>
        <VStack className="h-screen">
          <HStack className="items-center justify-between my-6 px-6">
            <FadeOutScaleDown
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace("/");
              }}
              className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
            >
              <ChevronDown size={24} color="white" />
            </FadeOutScaleDown>
            <Text className="text-white font-bold uppercase tracking-wider">
              {t("app.player.title")}
            </Text>
            <FadeOutScaleDown
              onPress={handlePresentModalPress}
              className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
            >
              <EllipsisVertical size={24} color="white" />
            </FadeOutScaleDown>
          </HStack>
          <VStack className={hasSyncedLyrics ? "mt-2" : "mt-12"}>
            <Box
              className="w-full mb-4 overflow-hidden"
              style={{ height: Math.max(0, coverWidth - 48) }}
              onLayout={(e) => setCoverWidth(e.nativeEvent.layout.width)}
            >
              {coverWidth > 0 && (
                <GestureDetector gesture={coverPanGesture}>
                  <Animated.View
                    style={[
                      { width: coverWidth, height: coverWidth - 48 },
                      coverRowStyle,
                    ]}
                  >
                    <Box style={{ position: "absolute", top: 0, left: 24 }}>
                      <CoverSlot
                        track={playingTrack ?? null}
                        size={coverWidth - 48}
                      />
                    </Box>
                    <Box
                      style={{
                        position: "absolute",
                        top: 0,
                        left: -coverWidth + 24,
                      }}
                    >
                      <CoverSlot track={prevTrack} size={coverWidth - 48} />
                    </Box>
                    <Box
                      style={{
                        position: "absolute",
                        top: 0,
                        left: coverWidth + 24,
                      }}
                    >
                      <CoverSlot track={nextTrack} size={coverWidth - 48} />
                    </Box>
                  </Animated.View>
                </GestureDetector>
              )}
            </Box>
            {hasSyncedLyrics && <CurrentLyricLine lyrics={lyrics} />}
            <VStack className="px-6">
              <HStack className="items-center justify-between gap-x-4">
                <VStack className="my-6 flex-1">
                  <FadeOut
                    onPress={() => {
                      if (!playingTrack?.albumId) return;
                      router.replace(`/albums/${playingTrack.albumId}`);
                    }}
                  >
                    <Heading className="text-white" size="xl" numberOfLines={2}>
                      {playingTrack?.title}
                    </Heading>
                  </FadeOut>
                  <FadeOut
                    onPress={() => {
                      if (!playingTrack?.artistId) return;
                      router.replace(`/artists/${playingTrack.artistId}`);
                    }}
                  >
                    <Text className="text-primary-100 text-lg">
                      {playingTrack?.artist}
                    </Text>
                  </FadeOut>
                </VStack>
                {!isRadio && isPodcast && podcastSeries && (
                  <FadeOut
                    onPress={
                      isPodcastFavorite
                        ? handleRemoveFavoritePodcastPress
                        : handleAddFavoritePodcastPress
                    }
                  >
                    <Heart
                      size={24}
                      color={isPodcastFavorite ? emerald500 : "white"}
                      fill={isPodcastFavorite ? emerald500 : "transparent"}
                    />
                  </FadeOut>
                )}
                {!isRadio && !isPodcast && (
                  <FadeOut
                    onPress={
                      playingTrack?.starred
                        ? handleUnfavoritePress
                        : handleFavoritePress
                    }
                  >
                    <Heart
                      size={24}
                      color={playingTrack?.starred ? emerald500 : "white"}
                      fill={playingTrack?.starred ? emerald500 : "transparent"}
                    />
                  </FadeOut>
                )}
              </HStack>
              {!isRadio && <PlaybackSlider />}
              {isRadio && <Box className="mb-6" />}
              <HStack
                className={
                  isRadio
                    ? "items-center justify-center"
                    : "items-center justify-between"
                }
              >
                {!isRadio && (
                  <FadeOut onPress={() => handleShufflePress(!shuffle)}>
                    {shuffle ? (
                      <>
                        <Shuffle size={24} color={emerald500} />
                        <Box className="absolute left-0 right-0 -bottom-2 flex items-center justify-center">
                          <Box className="bg-emerald-500 rounded-full size-1" />
                        </Box>
                      </>
                    ) : (
                      <Shuffle size={24} color="white" />
                    )}
                  </FadeOut>
                )}
                {!isRadio && (
                  <FadeOut onPress={handlePreviousPress}>
                    <SkipBack size={36} color="white" fill="white" />
                  </FadeOut>
                )}
                <FadeOut onPress={handlePlayPausePress}>
                  <Box className="h-16 w-16 rounded-full bg-white items-center justify-center">
                    {isPlaying ? (
                      <Pause size={24} color={gray800} fill={gray800} />
                    ) : (
                      <Play size={24} color={gray800} fill={gray800} />
                    )}
                  </Box>
                </FadeOut>
                {!isRadio && (
                  <FadeOut onPress={handleNextPress}>
                    <SkipForward size={36} color="white" fill="white" />
                  </FadeOut>
                )}
                {!isRadio && repeatMode === "off" && (
                  <FadeOut onPress={() => handleRepeatModePress("all")}>
                    <Repeat size={24} color="white" />
                  </FadeOut>
                )}
                {!isRadio && repeatMode === "all" && (
                  <FadeOut onPress={() => handleRepeatModePress("one")}>
                    <Repeat size={24} color={emerald500} />
                    <Box className="absolute left-0 right-0 -bottom-2 flex items-center justify-center">
                      <Box className="bg-emerald-500 rounded-full size-1" />
                    </Box>
                  </FadeOut>
                )}
                {!isRadio && repeatMode === "one" && (
                  <FadeOut onPress={() => handleRepeatModePress("off")}>
                    <Repeat1 size={24} color={emerald500} />
                  </FadeOut>
                )}
              </HStack>
              <HStack className="items-center justify-between mt-8">
                <CastButton
                  style={{ width: 24, height: 24, tintColor: "white" }}
                />
                {capabilities.jukebox && !isRadio && !castSession && (
                  <FadeOut onPress={handleJukeboxPress}>
                    <Speaker
                      size={24}
                      color={jukeboxActive ? emerald500 : "white"}
                    />
                    {jukeboxActive && (
                      <Box className="absolute left-0 right-0 -bottom-2 flex items-center justify-center">
                        <Box className="bg-emerald-500 rounded-full size-1" />
                      </Box>
                    )}
                  </FadeOut>
                )}
                <FadeOut onPress={() => router.replace("/queue")}>
                  <ListMusic size={24} color="white" />
                </FadeOut>
              </HStack>
            </VStack>
          </VStack>
        </VStack>
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
                {playingTrack?.artwork ? (
                  <Image
                    source={{
                      uri: playingTrack?.artwork,
                    }}
                    className="w-16 h-16 rounded-md aspect-square"
                    alt="Track cover"
                    contentFit={isRadio ? "contain" : "cover"}
                  />
                ) : (
                  <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                    {isRadio ? (
                      <RadioIcon size={24} color={white} />
                    ) : (
                      <AudioLines size={24} color={white} />
                    )}
                  </Box>
                )}
                <VStack className="ml-4 flex-1">
                  <Heading
                    className="text-white font-normal"
                    size="lg"
                    numberOfLines={1}
                  >
                    {playingTrack?.title}
                  </Heading>
                  {!isRadio && !isPodcast && (
                    <Text
                      numberOfLines={1}
                      className="text-md text-primary-100"
                    >
                      {playingTrack?.artist} ⦁ {playingTrack?.album}
                    </Text>
                  )}
                  {isPodcast && (
                    <Text
                      numberOfLines={1}
                      className="text-md text-primary-100"
                    >
                      {playingTrack?.artist}
                    </Text>
                  )}
                  {isRadio && (
                    <Text
                      numberOfLines={1}
                      className="text-md text-primary-100"
                    >
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
                  onActionStart={() => bottomSheetModalRef.current?.dismiss()}
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
                      <FadeOutScaleDown
                        onPress={handleRemoveFavoritePodcastPress}
                      >
                        <HStack className="items-center">
                          <CircleMinus size={24} color={gray200} />
                          <Text className="ml-4 text-lg text-gray-200">
                            {t("app.podcasts.removeFromFavorites")}
                          </Text>
                        </HStack>
                      </FadeOutScaleDown>
                    ) : (
                      <FadeOutScaleDown onPress={handleAddFavoritePodcastPress}>
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
                  <FadeOutScaleDown onPress={handleAddToPlaylistPress}>
                    <HStack className="items-center">
                      <PlusCircle size={24} color={gray200} />
                      <Text className="ml-4 text-lg text-gray-200">
                        {t("app.tracks.addToPlaylist")}
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
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
                  {playingTrack?.albumId && (
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
                  <FadeOutScaleDown onPress={handleShowLyricsPress}>
                    <HStack className="items-center">
                      <Mic2 size={24} color={gray200} />
                      <Text className="ml-4 text-lg text-gray-200">
                        {t("app.player.lyrics")}
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
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
                  <FadeOutScaleDown onPress={handleDownloadPress}>
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
              )}
            </Box>
          </BottomSheetView>
        </BottomSheetModal>
        <BottomSheetModal
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
          <BottomSheetView style={{ flex: 1, alignItems: "center" }}>
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
          </BottomSheetView>
        </BottomSheetModal>
        <BottomSheetModal
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
          <BottomSheetView
            style={{
              flex: 1,
              alignItems: "center",
            }}
          >
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
          ref={jukeboxSheetRef}
          onChange={handleJukeboxSheetPositionChange}
          backgroundStyle={{
            backgroundColor: "rgb(41, 41, 41)",
          }}
          handleIndicatorStyle={{
            backgroundColor: "#b3b3b3",
          }}
          backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
        >
          <BottomSheetView style={{ flex: 1, alignItems: "center" }}>
            <Box className="p-6 w-full mb-12">
              <HStack className="items-center mb-6">
                <Speaker
                  size={24}
                  color={jukeboxActive ? emerald500 : gray200}
                />
                <Heading
                  className="ml-4 text-white font-normal"
                  size="lg"
                  numberOfLines={1}
                >
                  {t("app.player.jukebox")}
                </Heading>
              </HStack>
              <VStack className="gap-y-6">
                <FadeOutScaleDown onPress={handleJukeboxToggle}>
                  <Text
                    className="text-lg"
                    style={{
                      color: jukeboxActive ? emerald500 : gray200,
                    }}
                  >
                    {jukeboxActive
                      ? t("app.player.jukeboxOn")
                      : t("app.player.jukeboxOff")}
                  </Text>
                </FadeOutScaleDown>
                {jukeboxActive && (
                  <VStack className="gap-y-2">
                    <Text className="text-sm text-primary-100">
                      {t("app.player.jukeboxGain")}
                    </Text>
                    <Slider
                      defaultValue={Math.round(jukeboxGain * 100)}
                      value={Math.round(jukeboxGain * 100)}
                      step={1}
                      minValue={0}
                      maxValue={100}
                      size="md"
                      orientation="horizontal"
                      isDisabled={false}
                      isReversed={false}
                      onChange={handleJukeboxGainChange}
                    >
                      <SliderTrack
                        className="bg-primary-400"
                        hitSlop={{ top: 20, bottom: 20, left: 8, right: 8 }}
                      >
                        <SliderFilledTrack className="bg-white data-[focus=true]:bg-white data-[active=true]:bg-white" />
                      </SliderTrack>
                      <SliderThumb
                        className="bg-white data-[focus=true]:bg-white data-[active=true]:bg-white"
                        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                      />
                    </Slider>
                    {jukeboxStatus && (
                      <Text className="text-sm text-primary-100 mt-2">
                        {t("app.player.jukeboxStatus", {
                          state: jukeboxStatus.playing
                            ? t("app.player.jukeboxStatePlaying")
                            : t("app.player.jukeboxStatePaused"),
                          index: (jukeboxStatus.currentIndex ?? 0) + 1,
                          total: queueLength,
                        })}
                      </Text>
                    )}
                  </VStack>
                )}
              </VStack>
            </Box>
          </BottomSheetView>
        </BottomSheetModal>
        <LyricsDialog
          isOpen={showLyricsDialog}
          onClose={() => setShowLyricsDialog(false)}
          lyrics={lyrics}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}
