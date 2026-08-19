import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import Cast from "lucide-react-native/dist/esm/icons/cast.mjs";
import ChevronDown from "lucide-react-native/dist/esm/icons/chevron-down.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Languages from "lucide-react-native/dist/esm/icons/languages.mjs";
import Share2 from "lucide-react-native/dist/esm/icons/share-2.mjs";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Share from "react-native-share";
import { Uniwind } from "uniwind";
import FadeOut from "@/components/FadeOut";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import PlayPauseButton from "@/components/PlayPauseButton";
import LyricsBody from "@/components/player/LyricsBody";
import LyricsLayersSheet from "@/components/player/LyricsLayersSheet";
import { openOutputSheet } from "@/components/player/OutputSheet";
import PlaybackSlider from "@/components/player/PlaybackSlider";
import PlayerSheets from "@/components/player/PlayerSheets";
import ShareLinkSheet from "@/components/player/ShareLinkSheet";
import { Box } from "@/components/ui/box";
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
import { useIsPlaying, usePlayingTrack, useSyncedLyrics } from "@/hooks/player";
import { useCapabilities } from "@/hooks/useCapabilities";
import useImageColors from "@/hooks/useImageColors";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useKeepScreenAwake } from "@/hooks/useKeepScreenAwake";
import { togglePlayPause } from "@/services/player";
import useApp from "@/stores/app";
import useJukebox from "@/stores/jukebox";
import useUpnp from "@/stores/upnp";
import { logError } from "@/utils/log";
import { cn } from "@/utils/tailwind";

const ICON_HIT_SLOP = { top: 16, bottom: 16, left: 16, right: 16 };

export default function LyricsScreen() {
  const [black, emerald500, gray800] = Uniwind.getCSSVariable([
    "--color-black",
    "--color-emerald-500",
    "--color-gray-800",
  ]) as string[];
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const karaokeEnabled = useApp((s) => s.karaokeEnabled);
  const setKaraokeEnabled = useApp((s) => s.setKaraokeEnabled);
  const translationLang = useApp((s) => s.lyricsTranslationLang);
  const showPronunciation = useApp((s) => s.lyricsShowPronunciation);
  const capabilities = useCapabilities();
  const isOnline = useIsOnline();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const actionsSheetRef = useRef<BottomSheetModal>(null);
  const shareSheetRef = useRef<BottomSheetModal>(null);
  const layersSheetRef = useRef<BottomSheetModal>(null);
  const [shareUrl, setShareUrl] = useState("");
  const jukeboxActive = useJukebox((s) => s.active);
  const upnpConnected = useUpnp((s) => s.connected);
  const playingRemotely = jukeboxActive || upnpConnected;
  const hasOutputs = capabilities.jukebox || capabilities.remoteStreamableUrl;
  const isPlaying = useIsPlaying();
  const lyricsKeepScreenOn = useApp((s) => s.lyricsKeepScreenOn);
  const playingTrack = usePlayingTrack();
  const colors = useImageColors(playingTrack?.artwork);
  const {
    lyrics,
    hasKaraoke,
    layers,
    hasTranslations,
    hasPronunciation,
    isLoading: lyricsLoading,
  } = useSyncedLyrics(playingTrack);
  const hasLayers = hasTranslations || hasPronunciation;
  useKeepScreenAwake(lyricsKeepScreenOn && isPlaying, "lyrics");
  const doShare = useCreateShare();
  const isRadio = !!playingTrack?.isRadio;
  const headerTextShadow = {
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  } as const;
  const topColor =
    (colors?.platform === "ios"
      ? colors.primary
      : colors?.muted === black
        ? colors?.darkVibrant
        : colors?.muted) || black;

  const handleClosePress = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/player");
  };

  const handleOutputPress = () => {
    openOutputSheet();
  };

  const handleToggleKaraoke = () => {
    setKaraokeEnabled(!karaokeEnabled);
  };

  const handleLayersPress = () => {
    layersSheetRef.current?.present();
  };

  const handleSharePress = () => {
    if (!playingTrack) return;
    if (capabilities.sharing && isOnline) {
      doShare.mutate(
        { id: playingTrack.id },
        {
          onSuccess: (data) => {
            setShareUrl(data?.shares?.share?.[0]?.url ?? "");
            queryClient.invalidateQueries({ queryKey: ["shares"] });
            shareSheetRef.current?.present();
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
      return;
    }
    const lyricsText = lyrics?.line
      .map((line) => line.value?.trim())
      .filter(Boolean)
      .join("\n");
    const header = [playingTrack.title, playingTrack.artist]
      .filter(Boolean)
      .join(" — ");
    Share.open({
      title: playingTrack.title,
      message: lyricsText ? `${header}\n\n${lyricsText}` : header,
      failOnCancel: false,
    }).catch(logError);
  };

  const handlePresentActionsPress = () => {
    actionsSheetRef.current?.present();
  };

  const handlePlayPausePress = () => {
    togglePlayPause();
  };

  return (
    <LinearGradient
      colors={[topColor, "#191A1F"]}
      locations={[0, 0.7]}
      style={{ flex: 1 }}
    >
      <Box className="absolute inset-0 bg-black/30" pointerEvents="none" />
      <VStack
        className="flex-1"
        style={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <HStack
          className={cn(
            "items-center justify-between mb-4 px-6",
            !isWideLayout && "mt-4",
          )}
        >
          <FadeOutScaleDown
            onPress={handleClosePress}
            className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
          >
            <ChevronDown size={24} color="white" />
          </FadeOutScaleDown>
          <VStack className="items-center flex-1 mx-2">
            <Text
              className="text-white font-bold"
              numberOfLines={1}
              style={headerTextShadow}
            >
              {playingTrack?.title}
            </Text>
            <Text
              className="text-white/70 text-sm"
              numberOfLines={1}
              style={headerTextShadow}
            >
              {playingTrack?.artist || t("app.shared.unknownArtist")}
            </Text>
          </VStack>
          {hasLayers || hasKaraoke ? (
            <HStack className="items-center gap-x-2">
              {hasLayers && (
                <FadeOutScaleDown
                  onPress={handleLayersPress}
                  className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
                >
                  <Languages
                    size={20}
                    color={
                      translationLang || showPronunciation
                        ? emerald500
                        : "white"
                    }
                  />
                </FadeOutScaleDown>
              )}
              {hasKaraoke && (
                <FadeOutScaleDown
                  onPress={handleToggleKaraoke}
                  className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
                >
                  <AudioLines
                    size={20}
                    color={karaokeEnabled ? emerald500 : "white"}
                  />
                </FadeOutScaleDown>
              )}
            </HStack>
          ) : (
            <Box className="w-10 h-10" />
          )}
        </HStack>
        <LyricsBody lyrics={lyrics} layers={layers} isLoading={lyricsLoading} />
        <VStack className="px-6 pt-4">
          <HStack className="items-center justify-between mb-4">
            {hasOutputs && !isRadio ? (
              <FadeOut
                hitSlop={ICON_HIT_SLOP}
                onPress={handleOutputPress}
                disabled={!isOnline}
              >
                <Cast
                  size={24}
                  color={playingRemotely ? emerald500 : "white"}
                />
                {playingRemotely && (
                  <Box className="absolute left-0 right-0 -bottom-2 flex items-center justify-center">
                    <Box className="bg-emerald-500 rounded-full size-1" />
                  </Box>
                )}
              </FadeOut>
            ) : (
              <Box className="w-6 h-6" />
            )}
            <FadeOut
              hitSlop={ICON_HIT_SLOP}
              onPress={handleSharePress}
              disabled={doShare.isPending}
            >
              <Share2 size={24} color="white" />
            </FadeOut>
            <FadeOut
              hitSlop={ICON_HIT_SLOP}
              onPress={handlePresentActionsPress}
            >
              <EllipsisVertical size={24} color="white" />
            </FadeOut>
          </HStack>
          <PlaybackSlider />
          <HStack className="items-center justify-center -mt-6 mb-2">
            <PlayPauseButton
              isPlaying={isPlaying}
              onPress={handlePlayPausePress}
              size={64}
              iconSize={24}
              color={gray800}
              className="bg-white"
            />
          </HStack>
        </VStack>
      </VStack>
      <PlayerSheets
        actionsSheetRef={actionsSheetRef}
        playingTrack={playingTrack ?? null}
        hideLyricsAction
      />
      <ShareLinkSheet sheetRef={shareSheetRef} url={shareUrl} />
      <LyricsLayersSheet
        sheetRef={layersSheetRef}
        translations={layers.translations}
        pronunciations={layers.pronunciations}
      />
    </LinearGradient>
  );
}
