import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import PlusCircle from "lucide-react-native/dist/esm/icons/circle-plus.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Info from "lucide-react-native/dist/esm/icons/info.mjs";
import ListPlus from "lucide-react-native/dist/esm/icons/list-plus.mjs";
import ListStart from "lucide-react-native/dist/esm/icons/list-start.mjs";
import Star from "lucide-react-native/dist/esm/icons/star.mjs";
import { type ComponentType, memo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
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
import { selectionHaptic } from "@/services/haptics";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks } from "@/services/player";
import useApp, { type SwipeAction } from "@/stores/app";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";
import { cn } from "@/utils/tailwind";
import { type TrackActionsApi, useTrackActions } from "./TrackActionsProvider";

// Distance (points) the row must travel before the action fires on release.
const SWIPE_THRESHOLD = 96;
// Cap the drag so the row can't be flung off-screen.
const MAX_TRANSLATE = 140;

// The lucide icon shown in the emerald reveal panel, per action (matching the
// icons used in the track actions bottom sheet).
const SWIPE_ACTION_ICONS: Record<
  Exclude<SwipeAction, "off">,
  ComponentType<{ size?: number; color?: string }>
> = {
  addToQueue: ListPlus,
  playNext: ListStart,
  rate: Star,
  showInfo: Info,
  addToPlaylist: PlusCircle,
};

const runSwipeAction = (
  api: TrackActionsApi,
  action: Exclude<SwipeAction, "off">,
  track: Child,
) => {
  switch (action) {
    case "addToQueue":
      api.addToQueue(track);
      break;
    case "playNext":
      api.playNext(track);
      break;
    case "rate":
      api.rate(track);
      break;
    case "showInfo":
      api.showInfo(track);
      break;
    case "addToPlaylist":
      api.addToPlaylist(track);
      break;
  }
};

interface TrackListItemProps {
  track: Child;
  index: number;
  onPress?: (index: number, track: Child) => void;
  showIndex?: boolean;
  handleRemoveFromPlaylist?: (index: string) => void;
  className?: string;
  onPlayCallback?: () => void;
  showCoverArt?: boolean;
  disableFirstItemMargin?: boolean;
  // Opt out of the swipe gesture (e.g. inside a draggable list where a
  // horizontal pan would fight the reorder drag).
  disableSwipe?: boolean;
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
  disableFirstItemMargin = false,
  disableSwipe = false,
}: TrackListItemProps) {
  const [white, gray300, black, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-300",
    "--color-black",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const isCurrentTrack = useIsCurrentTrack(track.id);
  const doUnfavorite = useUnstar();
  const toast = useToast();
  const isTrackDownloaded = useIsTrackAvailableOffline(track.id);
  const isOnline = useIsOnline();
  const isUnavailableOffline = !isOnline && !isTrackDownloaded;
  const api = useTrackActions();
  const swipeLeftAction = useApp((state) => state.swipeLeftAction);
  const swipeEnabled =
    swipeLeftAction !== "off" && !disableSwipe && !isUnavailableOffline;

  const translateX = useSharedValue(0);
  const crossedThreshold = useSharedValue(false);

  // Keep the worklet-facing gesture stable: read the latest action/track from a
  // ref instead of re-creating the pan gesture when they change.
  const swipeStateRef = useRef({ action: swipeLeftAction, track });
  swipeStateRef.current = { action: swipeLeftAction, track };

  const triggerSwipeAction = useCallback(() => {
    const { action, track: current } = swipeStateRef.current;
    if (action === "off") return;
    runSwipeAction(api, action, current);
  }, [api]);

  const panGesture = usePanGesture({
    activeOffsetX: [-15, 15],
    failOffsetY: [-12, 12],
    onUpdate: (e) => {
      let tx = e.translationX;
      if (tx < 0) tx = 0;
      if (tx > MAX_TRANSLATE) tx = MAX_TRANSLATE;
      translateX.value = tx;
      if (tx >= SWIPE_THRESHOLD && !crossedThreshold.value) {
        crossedThreshold.value = true;
        scheduleOnRN(selectionHaptic);
      } else if (tx < SWIPE_THRESHOLD && crossedThreshold.value) {
        crossedThreshold.value = false;
      }
    },
    onDeactivate: (e) => {
      if (e.translationX >= SWIPE_THRESHOLD) {
        scheduleOnRN(triggerSwipeAction);
      }
      crossedThreshold.value = false;
      translateX.value = withTiming(0, { duration: 180 });
    },
  });

  const foregroundStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const revealStyle = useAnimatedStyle(() => ({ width: translateX.value }));

  const SwipeIcon =
    swipeLeftAction === "off" ? null : SWIPE_ACTION_ICONS[swipeLeftAction];

  const handlePresentModalPress = () => {
    api.open(track, { index, handleRemoveFromPlaylist });
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

  const rowBody = (
    <>
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
              {track.artist || t("app.shared.unknownArtist")}
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
    </>
  );

  const pressable = (
    <Pressable
      onPress={isUnavailableOffline ? undefined : handleTrackPress}
      disabled={isUnavailableOffline}
    >
      <HStack
        className={cn(
          "items-center justify-between",
          { "opacity-80": isUnavailableOffline },
          className,
        )}
      >
        {rowBody}
      </HStack>
    </Pressable>
  );

  if (!swipeEnabled) {
    return (
      <Box
        className={cn("mb-4", {
          "mt-6": index === 0 && !disableFirstItemMargin,
        })}
      >
        {pressable}
      </Box>
    );
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Box
        className={cn("relative overflow-hidden mb-4", {
          "mt-6": index === 0 && !disableFirstItemMargin,
        })}
      >
        <Animated.View
          style={[
            {
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              backgroundColor: emerald500,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            },
            revealStyle,
          ]}
        >
          {SwipeIcon && <SwipeIcon size={24} color={black} />}
        </Animated.View>
        <Animated.View style={foregroundStyle}>{pressable}</Animated.View>
      </Box>
    </GestureDetector>
  );
}

export default memo(TrackListItem);
