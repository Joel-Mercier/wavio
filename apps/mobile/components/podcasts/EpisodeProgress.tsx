import { secondsToMinutes } from "date-fns/secondsToMinutes";
import CircleCheck from "lucide-react-native/dist/esm/icons/circle-check.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { HStack } from "@/components/ui/hstack";
import { Progress, ProgressFilledTrack } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import usePodcastProgress from "@/hooks/usePodcastProgress";
import { clearPodcastProgress } from "@/services/podcastProgress";
import { cn } from "@/utils/tailwind";

// Split in two so each half can sit where it belongs in an episode row: the bar
// reads as playback state and lives next to the play button, the check reads as
// an action and lives with the other actions. Both render null when the episode
// has no entry — which is also how "finished" is represented, since finishing
// removes it.

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

export function MarkAsPlayedButton({
  id,
  size = 24,
}: {
  id: string | undefined;
  size?: number;
}) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const entry = usePodcastProgress(id);

  if (!entry) return null;

  return (
    <FadeOutScaleDown onPress={() => clearPodcastProgress(entry.id)}>
      <CircleCheck size={size} color={white} />
    </FadeOutScaleDown>
  );
}
