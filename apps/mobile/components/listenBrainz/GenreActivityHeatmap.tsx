import { useTranslation } from "react-i18next";
import HourHeatmap, {
  HourHeatmapSkeleton,
} from "@/components/listenBrainz/HourHeatmap";
import type { HeatmapGrid } from "@/services/listenBrainz/statsMappers";

/**
 * Which genres you play at which hour of the day.
 *
 * Genre names come from MusicBrainz and are English whatever the app's locale,
 * so they are shown as they arrive; the label column is wider than the weekday
 * one to give them room, and still truncates.
 */
export default function GenreActivityHeatmap({ grid }: { grid: HeatmapGrid }) {
  const { t } = useTranslation();

  return (
    <HourHeatmap
      rows={grid.rows.map((row) => ({
        key: row.key,
        label: row.key,
        hours: row.hours,
      }))}
      max={grid.max}
      labelClassName="w-16"
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

export function GenreActivityHeatmapSkeleton() {
  return <HourHeatmapSkeleton />;
}
