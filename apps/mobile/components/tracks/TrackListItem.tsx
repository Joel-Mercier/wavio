import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import Circle from "lucide-react-native/dist/esm/icons/circle.mjs";
import CircleCheck from "lucide-react-native/dist/esm/icons/circle-check.mjs";
import PlusCircle from "lucide-react-native/dist/esm/icons/circle-plus.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Heart from "lucide-react-native/dist/esm/icons/heart.mjs";
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
import { VStack } from "@/components/ui/vstack";
import { useIsTrackAvailableOffline } from "@/hooks/offline";
import { useIsCurrentTrack } from "@/hooks/player";
import { useIsOnline } from "@/hooks/useIsOnline";
import { selectionHaptic } from "@/services/haptics";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks } from "@/services/player";
import useApp, { type SwipeAction } from "@/stores/app";
import useTrackSelection from "@/stores/trackSelection";
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
  ComponentType<{ size?: number; color?: string; fill?: string }>
> = {
  addToQueue: ListPlus,
  playNext: ListStart,
  favorite: Heart,
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
    case "favorite":
      api.toggleFavorite(track);
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
  const isTrackDownloaded = useIsTrackAvailableOffline(track.id);
  const isOnline = useIsOnline();
  const isUnavailableOffline = !isOnline && !isTrackDownloaded;
  const api = useTrackActions();
  // Two narrow selectors rather than one object: entering selection re-renders
  // every visible row once, but toggling a row after that must re-render only
  // the row that changed.
  const selectionActive = useTrackSelection((state) => state.active);
  const isSelected = useTrackSelection(
    (state) => !!state.selectedIds[track.id],
  );
  const swipeLeftAction = useApp((state) => state.swipeLeftAction);
  const swipeEnabled =
    swipeLeftAction !== "off" &&
    !disableSwipe &&
    !isUnavailableOffline &&
    !selectionActive;

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
  // Only the heart is ever filled, and only once the track is already a
  // favorite — lucide defaults `fill` to "none", so this is inert elsewhere.
  const swipeIconFill =
    swipeLeftAction === "favorite" && track.starred ? black : "none";

  const handlePresentModalPress = () => {
    api.open(track, { index, handleRemoveFromPlaylist });
  };

  const handleFavoriteTogglePress = useCallback(() => {
    api.toggleFavorite(track);
  }, [api, track]);

  const handleTrackPress = () => {
    if (selectionActive) {
      useTrackSelection.getState().toggle(track);
      return;
    }
    if (onPress) {
      onPress(index, track);
    } else {
      playTracks([childToTrack(track)], 0);
    }
    if (onPlayCallback) {
      onPlayCallback();
    }
  };

  // Reaching the actions sheet without having to hit the ⋮ target (issue #195).
  // No offline gate needed: the Pressable is already `disabled` for unavailable
  // rows, and RN suppresses long-press along with press.
  const handleTrackLongPress = () => {
    if (selectionActive) {
      useTrackSelection.getState().toggle(track);
      return;
    }
    void selectionHaptic();
    handlePresentModalPress();
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
            className={cn("text-white text-md font-normal mr-4", {
              "text-emerald-500": isCurrentTrack,
            })}
            numberOfLines={1}
          >
            {track.title}
          </Heading>
          <HStack className="items-center flex-1">
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
            onPress={handleFavoriteTogglePress}
            disabled={isUnavailableOffline}
            className="mr-3"
          />
        )}
        {selectionActive ? (
          // Not pressable: the whole row toggles in selection mode, so a
          // separate tap target here would only be a smaller way to do the
          // same thing.
          <Box testID="track-selection-indicator">
            {isSelected ? (
              <CircleCheck size={24} color={emerald500} />
            ) : (
              <Circle size={24} color={gray300} />
            )}
          </Box>
        ) : (
          <FadeOutScaleDown
            testID="track-menu-button"
            onPress={handlePresentModalPress}
            disabled={isUnavailableOffline}
            disabledOpacity={0.8}
          >
            <EllipsisVertical color={gray300} />
          </FadeOutScaleDown>
        )}
      </HStack>
    </>
  );

  const pressable = (
    <Pressable
      onPress={isUnavailableOffline ? undefined : handleTrackPress}
      onLongPress={isUnavailableOffline ? undefined : handleTrackLongPress}
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
        className={cn(
          // In selection mode the row's spacing moves from a margin to padding
          // so the highlight below can own the gap: a scanned list of dense
          // rows needs more than a 24px glyph on the far edge to read at a
          // glance, and a highlight that stops at the text leaves the rows
          // looking cramped. Split evenly, so the row keeps the height it had
          // and the list doesn't jump on entering selection.
          selectionActive ? "py-2" : "mb-4",
          { "mt-6": index === 0 && !disableFirstItemMargin },
          // Full-bleed and square-cornered: consecutive selected rows read as
          // one block rather than as a column of separate chips.
          { "bg-primary-600/40": isSelected },
        )}
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
          {SwipeIcon && (
            <SwipeIcon size={24} color={black} fill={swipeIconFill} />
          )}
        </Animated.View>
        <Animated.View style={foregroundStyle}>{pressable}</Animated.View>
      </Box>
    </GestureDetector>
  );
}

export default memo(TrackListItem);
