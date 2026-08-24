import { useTranslation } from "react-i18next";
import BarChart, { BarChartSkeleton } from "@/components/BarChart";
import type { DecadeBucket } from "@/services/listenBrainz/statsMappers";

/**
 * When the music you listened to was released, by decade.
 *
 * This says nothing about *when* you listened — it is the release years of the
 * recordings, which is why it sits apart from listening activity despite
 * looking like it.
 */
export default function DecadeActivityChart({
  buckets,
}: {
  buckets: DecadeBucket[];
}) {
  const { t } = useTranslation();
  const key = "app.settings.integrations.listenbrainz.stats";

  return (
    <BarChart
      bars={buckets.map((bucket) => ({
        key: bucket.key,
        label: t(`${key}.decade`, { decade: bucket.decade }),
        value: bucket.count,
        accessibilityLabel: t(`${key}.bucketA11y`, {
          label: t(`${key}.decade`, { decade: bucket.decade }),
          count: bucket.count,
        }),
      }))}
    />
  );
}

export function DecadeActivityChartSkeleton() {
  return <BarChartSkeleton />;
}
