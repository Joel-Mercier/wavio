import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import AnimatedHeart from "@/components/AnimatedHeart";
import DownloadedBadge from "@/components/DownloadedBadge";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { useUnstar } from "@/hooks/backend/useMediaAnnotation";
import { useIsTrackAvailableOffline } from "@/hooks/offline";
import { useIsCurrentTrack } from "@/hooks/player";
import { useIsOnline } from "@/hooks/useIsOnline";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks } from "@/services/player";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";
import { cn } from "@/utils/tailwind";
import { useTrackActions } from "./TrackActionsProvider";

interface TrackListItemProps {
  track: Child;
  index: number;
  onPress?: (index: number, track: Child) => void;
  showIndex?: boolean;
  handleRemoveFromPlaylist?: (index: string) => void;
  className?: string;
  onPlayCallback?: () => void;
  showCoverArt?: boolean;
}

// Rendered in every track list — memoized so a parent re-render (favorite
// toggles, download progress, …) doesn't re-render all visible rows. Callers
// must pass referentially stable onPress/onPlayCallback handlers.
function TrackListItem({
  track,
  index,
  onPress,
  showIndex = false,
  handleRemoveFromPlaylist,
  className,
  onPlayCallback,
  showCoverArt = true,
}: TrackListItemProps) {
  const [white, gray300] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-300",
  ]) as string[];
  const { t } = useTranslation();
  const isCurrentTrack = useIsCurrentTrack(track.id);
  const doUnfavorite = useUnstar();
  const toast = useToast();
  const isTrackDownloaded = useIsTrackAvailableOffline(track.id);
  const isOnline = useIsOnline();
  const isUnavailableOffline = !isOnline && !isTrackDownloaded;
  const { open } = useTrackActions();

  const handlePresentModalPress = () => {
    open(track, { index, handleRemoveFromPlaylist });
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
        onError: () => {
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

  const handleTrackPress = () => {
    if (onPress) {
      onPress(index, track);
    } else {
      playTracks([childToTrack(track)], 0);
    }
    if (onPlayCallback) {
      onPlayCallback();
    }
  };

  return (
    <Pressable
      onPress={isUnavailableOffline ? undefined : handleTrackPress}
      disabled={isUnavailableOffline}
    >
      <HStack
        className={cn(
          "items-center justify-between mb-4",
          {
            "mt-6": index === 0,
            "opacity-80": isUnavailableOffline,
          },
          className,
        )}
      >
        <HStack className="items-center flex-1">
          {showIndex && (
            <Text className="text-sm text-white mr-4">{index + 1}</Text>
          )}
          {showCoverArt && (
            <ImageWithFallback
              source={
                track.coverArt ? { uri: artworkUrl(track.coverArt) } : undefined
              }
              className="w-16 h-16 rounded-md aspect-square"
              alt="Track cover"
              fallback={
                <Box className="w-16 h-16 aspect-square rounded-md bg-primary-600 items-center justify-center">
                  <AudioLines size={24} color={white} />
                </Box>
              }
            />
          )}
          <VStack
            className={cn("flex-1", {
              "ml-4": showCoverArt,
            })}
          >
            <Heading
              testID="track-title"
              className={cn("text-white text-md font-normal capitalize mr-4", {
                "text-emerald-500": isCurrentTrack,
              })}
              numberOfLines={1}
            >
              {track.title}
            </Heading>
            <HStack className="items-center">
              {isTrackDownloaded && <DownloadedBadge className="mr-2" />}
              {track.explicitStatus === "explicit" && (
                <Box className="flex items-center justify-center rounded-sm bg-primary-100 px-1 py-0.5 mr-2">
                  <Text className="text-black text-xs font-bold leading-none">
                    E
                  </Text>
                </Box>
              )}
              <Text numberOfLines={1} className="text-md text-primary-100">
                {track.artist}
              </Text>
            </HStack>
          </VStack>
        </HStack>
        <HStack className="items-center">
          {track.starred && (
            <AnimatedHeart
              filled
              onPress={handleUnfavoritePress}
              disabled={isUnavailableOffline}
              className="mr-3"
            />
          )}
          <FadeOutScaleDown
            testID="track-menu-button"
            onPress={handlePresentModalPress}
            disabled={isUnavailableOffline}
            disabledOpacity={0.8}
          >
            <EllipsisVertical color={gray300} />
          </FadeOutScaleDown>
        </HStack>
      </HStack>
    </Pressable>
  );
}

export default memo(TrackListItem);
