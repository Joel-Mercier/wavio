import { usePathname } from "expo-router";
import AudioLines from "lucide-react-native/icons/audio-lines";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Uniwind } from "uniwind";
import SleepTimerBadge, {
  SLEEP_TIMER_BADGE_GAP,
  SLEEP_TIMER_BADGE_HEIGHT,
} from "@/components/player/SleepTimerBadge";
import { Center } from "@/components/ui/center";
import { Pressable } from "@/components/ui/pressable";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import useApp from "@/stores/app";
import useFloatingPlayer from "@/stores/floatingPlayer";
import { hidesFloatingPlayer } from "@/utils/floatingPlayerRoutes";

// Height the badge takes above the tab bar while the portrait player is swiped
// away. The sleep-timer badge shares its row, so screens only give up one
// badge's height, not the player's.
export function useFloatingPlayerRestoreBadgeSpace(): number {
  const hidden = useFloatingPlayer((s) => s.hidden);
  const isWideLayout = useApp((s) => s.isWideLayout);
  const playingTrack = usePlayingTrack();
  const pathname = usePathname();
  if (
    !hidden ||
    isWideLayout ||
    !playingTrack ||
    hidesFloatingPlayer(pathname)
  ) {
    return 0;
  }
  return SLEEP_TIMER_BADGE_HEIGHT + SLEEP_TIMER_BADGE_GAP;
}

interface FloatingPlayerRestoreBadgeProps {
  onPress: () => void;
}

export default function FloatingPlayerRestoreBadge({
  onPress,
}: FloatingPlayerRestoreBadgeProps) {
  const { t } = useTranslation();
  const isPlaying = useIsPlaying();
  const [white, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
  ]) as string[];

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(180)}
      pointerEvents="box-none"
      className="mx-2 flex-row items-center justify-end gap-x-2"
      style={{ marginBottom: SLEEP_TIMER_BADGE_GAP }}
    >
      <SleepTimerBadge inline />
      <Pressable
        testID="floating-player-restore-badge"
        accessibilityRole="button"
        accessibilityLabel={t("app.player.showFloatingPlayer")}
        hitSlop={8}
        onPress={onPress}
      >
        <Center
          className="rounded-full bg-primary-600"
          style={{
            width: SLEEP_TIMER_BADGE_HEIGHT,
            height: SLEEP_TIMER_BADGE_HEIGHT,
          }}
        >
          <AudioLines size={14} color={isPlaying ? emerald500 : white} />
        </Center>
      </Pressable>
    </Animated.View>
  );
}
