import { useTranslation } from "react-i18next";
import BarChart, { BarChartSkeleton } from "@/components/BarChart";
import type { ActivityBucket } from "@/services/listenBrainz/statsMappers";
import type { StatsRange } from "@/services/listenBrainz/types";
import { format } from "@/utils/date";

// What each bucket of a given range spans, and so what its axis label has to
// say. The API labels them itself ("Monday 13 July 2026", "01 May 2026"), but
// always in English, so the label is rebuilt from the bucket's start date in
// the app's locale instead.
const AXIS_FORMAT: Record<StatsRange, string> = {
  week: "EEE d", // a day, within two weeks — so the weekday alone won't do
  month: "d MMM", // a day, within two months
  year: "MMM yy", // a month, within two years — which one has to be said
  all_time: "yyyy", // a year
};

// Spelled out for the screen reader, which is not reading a cramped axis.
const A11Y_FORMAT: Record<StatsRange, string> = {
  week: "EEEE d MMMM",
  month: "d MMMM",
  year: "MMMM yyyy",
  all_time: "yyyy",
};

export default function ListeningActivityChart({
  buckets,
  range,
}: {
  buckets: ActivityBucket[];
  range: StatsRange;
}) {
  const { t } = useTranslation();

  return (
    <BarChart
      bars={buckets.map((bucket) => {
        const date = new Date(bucket.fromTs * 1000);
        return {
          key: bucket.key,
          label: format(date, AXIS_FORMAT[range]),
          value: bucket.count,
          accessibilityLabel: t(
            "app.settings.integrations.listenbrainz.stats.bucketA11y",
            { label: format(date, A11Y_FORMAT[range]), count: bucket.count },
          ),
        };
      })}
    />
  );
}

export function ListeningActivityChartSkeleton() {
  return <BarChartSkeleton />;
}
