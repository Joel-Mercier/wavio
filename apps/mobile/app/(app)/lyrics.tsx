import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import MaskedView from "@react-native-masked-view/masked-view";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import ChevronDown from "lucide-react-native/dist/esm/icons/chevron-down.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Share2 from "lucide-react-native/dist/esm/icons/share-2.mjs";
import Speaker from "lucide-react-native/dist/esm/icons/speaker.mjs";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView } from "react-native";
import { useCastSession } from "react-native-google-cast";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Share from "react-native-share";
import { Uniwind } from "uniwind";
import FadeOut from "@/components/FadeOut";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import PlayPauseButton from "@/components/PlayPauseButton";
import { openJukeboxSheet } from "@/components/player/jukeboxSheetController";
import LyricsLine, { LYRICS_LINE_HEIGHT } from "@/components/player/LyricsLine";
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
import {
  getPlaybackSnapshot,
  subscribePlaybackProgress,
} from "@/hooks/player/playbackSnapshot";
import { useCapabilities } from "@/hooks/useCapabilities";
import useImageColors from "@/hooks/useImageColors";
import { useIsOnline } from "@/hooks/useIsOnline";
import type { StructuredLyrics } from "@/services/openSubsonic/types";
import { seekTo, togglePlayPause } from "@/services/player";
import useApp from "@/stores/app";
import useJukebox from "@/stores/jukebox";
import { logError } from "@/utils/log";
import { findCurrentLineIndex } from "@/utils/lyrics";
import { cn } from "@/utils/tailwind";

const ICON_HIT_SLOP = { top: 16, bottom: 16, left: 16, right: 16 };
const MANUAL_SCROLL_GRACE_MS = 4000;

function LyricsBody({ lyrics }: { lyrics: StructuredLyrics | null }) {
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const userScrollingUntilRef = useRef(0);
  const lineLayoutsRef = useRef<{ y: number; height: number }[]>([]);
  const offsetMs = lyrics?.offset ?? 0;

  useEffect(() => {
    lineLayoutsRef.current = [];
  }, [lyrics]);

  useEffect(() => {
    const update = () => {
      const { currentTime } = getPlaybackSnapshot();
      const positionMs = (currentTime ?? 0) * 1000 + offsetMs;
      const next = lyrics ? findCurrentLineIndex(lyrics.line, positionMs) : -1;
      setCurrentIndex((prev) => (prev === next ? prev : next));
    };
    update();
    return subscribePlaybackProgress(update);
  }, [lyrics, offsetMs]);

  useEffect(() => {
    if (currentIndex < 0) return;
    if (!containerHeight) return;
    if (Date.now() < userScrollingUntilRef.current) return;
    const layout = lineLayoutsRef.current[currentIndex];
    const target = layout
      ? Math.max(0, layout.y + layout.height / 2 - containerHeight / 2)
      : Math.max(
          0,
          currentIndex * LYRICS_LINE_HEIGHT -
            containerHeight / 2 +
            LYRICS_LINE_HEIGHT / 2,
        );
    scrollRef.current?.scrollTo({ y: target, animated: true });
  }, [currentIndex, containerHeight]);

  return (
    <Box
      className="flex-1"
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      <MaskedView
        style={{ flex: 1 }}
        maskElement={
          <LinearGradient
            colors={["transparent", "#000", "#000", "transparent"]}
            locations={[0, 0.06, 0.94, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ flex: 1 }}
          />
        }
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          onScrollBeginDrag={() => {
            userScrollingUntilRef.current = Date.now() + MANUAL_SCROLL_GRACE_MS;
          }}
          contentContainerStyle={{ paddingVertical: 32, paddingHorizontal: 24 }}
        >
          {lyrics?.line.map((line, index) => {
            const { start } = line;
            return (
              <Box
                key={`${index}-${start ?? 0}`}
                onLayout={(e) => {
                  lineLayoutsRef.current[index] = {
                    y: e.nativeEvent.layout.y,
                    height: e.nativeEvent.layout.height,
                  };
                }}
              >
                <LyricsLine
                  value={line.value}
                  isActive={index === currentIndex}
                  isPast={index < currentIndex}
                  onPress={
                    lyrics.synced && start != null
                      ? () => seekTo(Math.max(0, (start - offsetMs) / 1000))
                      : undefined
                  }
                />
              </Box>
            );
          })}
          {!lyrics && (
            <Box className="flex-1 items-center justify-center pt-12">
              <Text className="text-white text-center text-lg">
                {t("app.player.lyricsUnavailable")}
              </Text>
            </Box>
          )}
        </ScrollView>
      </MaskedView>
    </Box>
  );
}

export default function LyricsScreen() {
  const [blue500, emerald500, gray800] = Uniwind.getCSSVariable([
    "--color-blue-500",
    "--color-emerald-500",
    "--color-gray-800",
  ]) as string[];
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const capabilities = useCapabilities();
  const isOnline = useIsOnline();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const actionsSheetRef = useRef<BottomSheetModal>(null);
  const shareSheetRef = useRef<BottomSheetModal>(null);
  const [shareUrl, setShareUrl] = useState("");
  const jukeboxActive = useJukebox((s) => s.active);
  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const colors = useImageColors(playingTrack?.artwork);
  const { lyrics } = useSyncedLyrics(playingTrack);
  const castSession = useCastSession();
  const doShare = useCreateShare();
  const isRadio = !!playingTrack?.isRadio;
  const headerTextShadow = {
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  } as const;
  const topColor =
    (colors?.platform === "ios" ? colors.primary : colors?.lightMuted) ||
    blue500;

  const handleClosePress = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/player");
  };

  const handleJukeboxPress = () => {
    openJukeboxSheet();
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
          <Box className="w-10 h-10" />
        </HStack>
        <LyricsBody lyrics={lyrics} />
        <VStack className="px-6 pt-4">
          <HStack className="items-center justify-between mb-4">
            {capabilities.jukebox && !isRadio && !castSession ? (
              <FadeOut
                hitSlop={ICON_HIT_SLOP}
                onPress={handleJukeboxPress}
                disabled={!isOnline}
              >
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
    </LinearGradient>
  );
}
