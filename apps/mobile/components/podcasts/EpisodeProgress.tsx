import { secondsToMinutes } from "date-fns/secondsToMinutes";
import CircleCheck from "lucide-react-native/icons/circle-check";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { HStack } from "@/components/ui/hstack";
import { Progress, ProgressFilledTrack } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import usePodcastPlayed from "@/hooks/usePodcastPlayed";
import usePodcastProgress from "@/hooks/usePodcastProgress";
import {
  markPodcastEpisodePlayed,
  markPodcastEpisodeUnplayed,
} from "@/services/podcastProgress";
import type { PodcastSource } from "@/stores/podcasts";
import { cn } from "@/utils/tailwind";

// Split in two so each half can sit where it belongs in an episode row: the bar
// reads as playback state and lives next to the play button, the check reads as
// an action and lives with the other actions. The bar renders null when the
// episode has no entry, which a played episode never has.

export function EpisodeProgressBar({
  id,
  barClassName = "w-16",
}: {
  id: string | undefined;
  barClassName?: string;
}) {
  const { t } = useTranslation();
  const entry = usePodcastProgress(id);

  if (!entry) return null;

  const remaining = entry.duration
    ? Math.max(0, entry.duration - entry.position)
    : null;

  return (
    <HStack className="items-center gap-x-2">
      {!!entry.duration && (
        // Explicit colours: the component's default track and fill are both
        // `bg-primary`, which renders near-black on this dark surface.
        <Progress
          value={Math.min(100, (entry.position / entry.duration) * 100)}
          className={cn("bg-primary-600 h-1", barClassName)}
        >
          <ProgressFilledTrack className="bg-emerald-500" />
        </Progress>
      )}
      <Text className="text-primary-100 text-xs" numberOfLines={1}>
        {remaining != null
          ? t("app.podcasts.timeLeft", { minutes: secondsToMinutes(remaining) })
          : t("app.podcasts.inProgress")}
      </Text>
    </HStack>
  );
}

// Green once played (tap to unmark), white otherwise (tap to mark played).
// Shown on never-started episodes too, so a listening history kept elsewhere
// can be carried over by hand.
export function MarkAsPlayedButton({
  id,
  source,
  size = 24,
}: {
  id: string | undefined;
  source: PodcastSource;
  size?: number;
}) {
  const [white, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
  ]) as string[];
  const isPlayed = usePodcastPlayed(id, source);

  if (!id) return null;

  return (
    <FadeOutScaleDown
      onPress={() =>
        isPlayed
          ? markPodcastEpisodeUnplayed(id, source)
          : markPodcastEpisodePlayed(id, source)
      }
    >
      <CircleCheck size={size} color={isPlayed ? emerald500 : white} />
    </FadeOutScaleDown>
  );
}
