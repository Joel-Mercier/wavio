import { useTranslation } from "react-i18next";
import HourHeatmap, {
  HourHeatmapSkeleton,
} from "@/components/listenBrainz/HourHeatmap";
import type { HeatmapGrid } from "@/services/listenBrainz/statsMappers";
import { format } from "@/utils/date";

// 2024-01-01 was a Monday, so seven consecutive days from here give the weekday
// names in the Monday-first order the grid uses, localised by date-fns.
const MONDAY = new Date(2024, 0, 1);

function weekdayLabel(index: number): string {
  return format(
    new Date(MONDAY.getFullYear(), MONDAY.getMonth(), MONDAY.getDate() + index),
    "EEE",
  );
}

/** Listening by weekday and hour, as a 7×24 grid of cubes. */
export default function DailyActivityHeatmap({ grid }: { grid: HeatmapGrid }) {
  const { t } = useTranslation();

  return (
    <HourHeatmap
      rows={grid.rows.map((row, index) => ({
        key: row.key,
        label: weekdayLabel(index),
        hours: row.hours,
      }))}
      max={grid.max}
      describeCell={(row, hour, count) =>
        t("app.settings.integrations.listenbrainz.stats.heatmapCellA11y", {
          row: row.label,
          hour,
          count,
        })
      }
    />
  );
}

export function DailyActivityHeatmapSkeleton() {
  return <HourHeatmapSkeleton />;
}
