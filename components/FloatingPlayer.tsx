import { usePathname, useRouter } from "expo-router";
import { AudioLines, Pause, Play } from "lucide-react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import FadeOut from "@/components/FadeOut";
import MovingText from "@/components/MovingText";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import useImageColors from "@/hooks/useImageColors";
import {
  skipNext,
  skipPrevious,
  togglePlayPause,
  usePlayerStatus,
  usePlayingTrack,
} from "@/services/player";
import useQueue from "@/stores/queue";

export const FLOATING_PLAYER_HEIGHT = 64;

const SWIPE_THRESHOLD = 80;
const MAX_TRANSLATE = 140;

export default function FloatingPlayer() {
  const status = usePlayerStatus();
  const playingTrack = usePlayingTrack();
  const router = useRouter();
  const pathname = usePathname();
  const colors = useImageColors(playingTrack?.artwork);

  const queueLength = useQueue((s) => s.queue.length);
  const currentIndex = useQueue((s) => s.currentIndex);
  const repeatMode = useQueue((s) => s.repeatMode);
  const shuffle = useQueue((s) => s.shuffle);

  const canSkipNext =
    shuffle ||
    repeatMode !== "off" ||
    (currentIndex != null && currentIndex < queueLength - 1);
  const canSkipPrevious =
    shuffle ||
    repeatMode !== "off" ||
    (currentIndex != null && currentIndex > 0);

  const translateX = useSharedValue(0);

  const handlePress = () => {
    router.navigate("/player");
  };

  const handlePlayPausePress = () => {
    togglePlayPause();
  };

  const textStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity:
      Math.abs(translateX.value) >= SWIPE_THRESHOLD
        ? 0.5
        : 1 - Math.abs(translateX.value) / (SWIPE_THRESHOLD * 2.5),
  }));

  if (!playingTrack || pathname.startsWith("/player")) {
    return null;
  }

  const backgroundColor =
    (colors?.platform === "ios" ? colors.background : colors?.muted) ||
    themeConfig.theme.colors.primary[500];

  const panGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      let tx = e.translationX;
      if (tx > 0 && !canSkipPrevious) return;
      if (tx < 0 && !canSkipNext) return;
      if (tx > MAX_TRANSLATE) tx = MAX_TRANSLATE;
      if (tx < -MAX_TRANSLATE) tx = -MAX_TRANSLATE;
      translateX.value = tx;
    })
    .onEnd((e) => {
      if (e.translationX <= -SWIPE_THRESHOLD && canSkipNext) {
        runOnJS(skipNext)();
      } else if (e.translationX >= SWIPE_THRESHOLD && canSkipPrevious) {
        runOnJS(skipPrevious)();
      }
      translateX.value = withTiming(0, { duration: 180 });
    });

  return (
    <GestureDetector gesture={panGesture}>
      <Pressable
        className="absolute bottom-28 right-0 left-0"
        onPress={handlePress}
      >
        <HStack
          className="h-16 mx-2 px-4 py-2 rounded-md items-center justify-between overflow-hidden"
          style={{
            backgroundColor: backgroundColor,
          }}
        >
          <HStack className="items-center flex-1">
            <Box style={{ zIndex: 2 }} className="rounded-md">
              {playingTrack.artwork ? (
                <Image
                  source={{ uri: playingTrack.artwork }}
                  className="w-12 h-12 rounded-md aspect-square"
                  alt="Track cover"
                />
              ) : (
                <Box className="w-12 h-12 rounded-md bg-primary-600 items-center justify-center">
                  <AudioLines
                    size={24}
                    color={themeConfig.theme.colors.white}
                  />
                </Box>
              )}
            </Box>

            <Animated.View
              style={[textStyle, { zIndex: 1 }]}
              className="ml-4 flex-1"
            >
              {/* <MovingText
                text={activeTrack.title || ""}
                animationThreshold={45}
              /> */}
              <Text numberOfLines={1} className="text-white font-bold text-md">
                {playingTrack.title}
              </Text>
              <Text numberOfLines={1} className="text-gray-300">
                {playingTrack.artist}
              </Text>
            </Animated.View>
          </HStack>
          <HStack className="items-center pl-4" style={{ zIndex: 2 }}>
            <FadeOut onPress={handlePlayPausePress}>
              {status.playing ? (
                <Pause
                  color={themeConfig.theme.colors.white}
                  stroke={undefined}
                  fill={themeConfig.theme.colors.white}
                />
              ) : (
                <Play
                  color={themeConfig.theme.colors.white}
                  stroke={undefined}
                  fill={themeConfig.theme.colors.white}
                />
              )}
            </FadeOut>
          </HStack>
          <Box className="absolute inset-0 bg-black/30 -z-10" />
        </HStack>
      </Pressable>
    </GestureDetector>
  );
}
