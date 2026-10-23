import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui/text";
import { useQueueEnd } from "@/hooks/player/usePlaybackEnd";
import { useFormatClockTime } from "@/hooks/useFormatClockTime";
import { formatDuration } from "@/utils/date";

export default function QueueEndFooter() {
  const { t } = useTranslation();
  const { now, end, bySleepTimer } = useQueueEnd(true);
  const formatClockTime = useFormatClockTime();
  if (!end) return null;
  const key = bySleepTimer
    ? end.approximate
      ? "app.queue.sleepStopsAround"
      : "app.queue.sleepStopsAt"
    : end.approximate
      ? "app.queue.endsAround"
      : "app.queue.endsAt";
  return (
    <Text
      testID="queue-end-footer"
      className="text-primary-100 text-sm text-center mt-6"
    >
      {t(key, {
        time: formatClockTime(end.at),
        remaining: formatDuration(Math.max(0, end.at - now) / 1000),
      })}
    </Text>
  );
}
