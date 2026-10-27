import Timer from "lucide-react-native/icons/timer";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { openSleepTimerSheet } from "@/components/player/SleepTimerSheet";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { useIsFloatingPlayerVisible } from "@/hooks/player";
import { useSleepTimerEnd } from "@/hooks/player/usePlaybackEnd";
import { useFormatClockTime } from "@/hooks/useFormatClockTime";
import { isSleepTimerActive, useSleepTimer } from "@/services/sleepTimer";
import useApp from "@/stores/app";

export const SLEEP_TIMER_BADGE_HEIGHT = 28;
export const SLEEP_TIMER_BADGE_GAP = 6;

export function useSleepTimerLabel(): string | null {
  const { t } = useTranslation();
  const { active, endsAt, finishing, end } = useSleepTimerEnd();
  const formatClockTime = useFormatClockTime();
  if (!active) return null;
  const at = end?.at ?? endsAt;
  if (at != null) {
    return t(
      end?.approximate
        ? "app.player.sleepTimerBadgeEndsAround"
        : "app.player.sleepTimerBadgeEndsAt",
      { time: formatClockTime(at) },
    );
  }
  return finishing
    ? t("app.player.sleepTimerFinishing")
    : t("app.player.sleepTimerEndOfTrack");
}

// Height the badge adds above the portrait floating player, which carries it. In
// landscape it sits inside the sidebar, clear of the content.
export function useSleepTimerBadgeSpace(): number {
  const active = useSleepTimer(isSleepTimerActive);
  const isWideLayout = useApp((s) => s.isWideLayout);
  const playerVisible = useIsFloatingPlayerVisible();
  if (!active || isWideLayout || !playerVisible) return 0;
  return SLEEP_TIMER_BADGE_HEIGHT + SLEEP_TIMER_BADGE_GAP;
}

export default function SleepTimerBadge() {
  const label = useSleepTimerLabel();
  const [emerald500] = Uniwind.getCSSVariable([
    "--color-emerald-500",
  ]) as string[];

  if (!label) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(180)}
      pointerEvents="box-none"
      className="mx-2 items-end"
      style={{ marginBottom: SLEEP_TIMER_BADGE_GAP }}
    >
      <FadeOutScaleDown
        testID="sleep-timer-badge"
        onPress={openSleepTimerSheet}
      >
        <HStack
          className="items-center gap-x-1.5 px-3 rounded-full bg-primary-600"
          style={{ height: SLEEP_TIMER_BADGE_HEIGHT }}
        >
          <Timer size={14} color={emerald500} />
          <Text className="text-white text-xs font-bold" numberOfLines={1}>
            {label}
          </Text>
        </HStack>
      </FadeOutScaleDown>
    </Animated.View>
  );
}
