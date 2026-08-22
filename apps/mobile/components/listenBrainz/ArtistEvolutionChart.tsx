import { useTranslation } from "react-i18next";
import BarChart, {
  BarChartLegend,
  BarChartSkeleton,
} from "@/components/BarChart";
import { VStack } from "@/components/ui/vstack";
import type { ArtistEvolution } from "@/services/listenBrainz/statsMappers";
import type { StatsRange } from "@/services/listenBrainz/types";
import { format } from "@/utils/date";

/**
 * Categorical series colours, in fixed order — slot 1 is always the top artist,
 * and a shorter list never re-colours the artists that remain.
 *
 * Stepped for a dark surface and validated as a set: every adjacent pair clears
 * the colour-blind separation floor against this screen's background, which is
 * not something a hand-picked rainbow does.
 */
const SERIES_COLORS = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
] as const;

// Not a series: everyone outside the top few pooled together, so it takes the
// neutral the rest of the chrome uses rather than a seventh identity.
const OTHER_COLOR = "#525252";

// 2024-01-01 was a Monday, so weekday index → name goes through date-fns like
// everywhere else rather than through a hardcoded English list.
const MONDAY = new Date(2024, 0, 1);

function unitLabel(sort: number, range: StatsRange): string {
  if (range === "week") {
    return format(new Date(2024, 0, MONDAY.getDate() + sort), "EEE");
  }
  if (range === "year") return format(new Date(2024, sort, 1), "MMM");
  return String(sort);
}

/**
 * Who you listened to, over the periods of the range — one stacked column per
 * period, one band per artist.
 */
export default function ArtistEvolutionChart({
  evolution,
  range,
}: {
  evolution: ArtistEvolution;
  range: StatsRange;
}) {
  const { t } = useTranslation();
  const key = "app.settings.integrations.listenbrainz.stats";

  const seriesLabel = (index: number) =>
    evolution.series[index].isOther
      ? t(`${key}.otherArtists`)
      : evolution.series[index].key;
  const seriesColor = (index: number) =>
    evolution.series[index].isOther
      ? OTHER_COLOR
      : SERIES_COLORS[index % SERIES_COLORS.length];

  return (
    <VStack className="gap-y-2">
      <BarChart
        bars={evolution.units.map((unit) => {
          const total = unit.values.reduce((sum, value) => sum + value, 0);
          return {
            key: unit.key,
            label: unitLabel(unit.sort, range),
            value: total,
            segments: unit.values.map((value, index) => ({
              key: evolution.series[index].key,
              value,
              color: seriesColor(index),
            })),
            accessibilityLabel: t(`${key}.bucketA11y`, {
              label: unitLabel(unit.sort, range),
              count: total,
            }),
          };
        })}
      />
      <BarChartLegend
        items={evolution.series.map((series, index) => ({
          key: series.key,
          label: seriesLabel(index),
          color: seriesColor(index),
        }))}
      />
    </VStack>
  );
}

export function ArtistEvolutionChartSkeleton() {
  return <BarChartSkeleton />;
}
