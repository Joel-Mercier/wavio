import { useTranslation } from "react-i18next";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { intensityBucket } from "@/services/listenBrainz/statsMappers";
import { cn } from "@/utils/tailwind";

// Five steps, as GitHub's contribution graph has: one for "nothing" and four
// for increasing intensity, so a quiet hour never reads as an empty one.
const LEVEL_CLASSES = [
  "bg-primary-700",
  "bg-emerald-900",
  "bg-emerald-700",
  "bg-emerald-500",
  "bg-emerald-300",
] as const;

const LABELLED_HOURS = [0, 6, 12, 18];
const HOURS_PER_DAY = 24;

export type HourHeatmapRow = {
  key: string;
  label: string;
  hours: number[];
};

/**
 * Counts laid out as rows × 24 hourly cubes — by weekday, by genre, by whatever
 * the row happens to be.
 *
 * Cells are `flex-1 aspect-square` rather than a measured pixel size: 24
 * columns have to fit a narrow phone, a tablet and the wide layout, and letting
 * flex do it avoids an onLayout pass and a re-render on rotation. The row label
 * column is fixed-width for the same reason — the grid must not shift because
 * one label is longer than the others.
 */
export default function HourHeatmap({
  rows,
  max,
  labelClassName = "w-8",
  describeCell,
}: {
  rows: HourHeatmapRow[];
  max: number;
  labelClassName?: string;
  describeCell: (row: HourHeatmapRow, hour: number, count: number) => string;
}) {
  const { t } = useTranslation();
  const key = "app.settings.integrations.listenbrainz.stats";

  return (
    <VStack className="gap-y-3 py-2">
      <VStack className="gap-y-[2px]">
        {rows.map((row) => (
          <HStack key={row.key} className="items-center gap-x-[2px]">
            <Text
              className={cn("text-primary-300 text-[10px]", labelClassName)}
              numberOfLines={1}
            >
              {row.label}
            </Text>
            {row.hours.map((count, hour) => (
              <Box
                // biome-ignore lint/suspicious/noArrayIndexKey: the index is the hour, which is the cell's identity in a fixed 24-column grid
                key={`${row.key}-${hour}`}
                accessibilityLabel={describeCell(row, hour, count)}
                className={cn(
                  "flex-1 aspect-square rounded-[2px]",
                  LEVEL_CLASSES[intensityBucket(count, max)],
                )}
              />
            ))}
          </HStack>
        ))}
        <HStack className="items-center gap-x-[2px]">
          <Box className={labelClassName} />
          {/* One tick per quarter of the day rather than per column: a cell is
              a dozen pixels wide, which "12" and "18" do not fit inside — they
              came out as an ellipsis. Each tick spans its quarter and is
              left-aligned on the hour it names. */}
          {LABELLED_HOURS.map((hour) => (
            <Box
              key={hour}
              className="items-start"
              style={{ flex: HOURS_PER_DAY / LABELLED_HOURS.length }}
            >
              <Text className="text-primary-300 text-[10px]" numberOfLines={1}>
                {hour}
              </Text>
            </Box>
          ))}
        </HStack>
        {/* Four bare numbers under a grid are not self-explanatory, and this
            axis is the same 24 hours whichever period is selected above. */}
        <Text className="text-primary-300 text-[10px] text-center mt-1">
          {t(`${key}.hourAxis`)}
        </Text>
      </VStack>

      <HStack className="items-center justify-end gap-x-1">
        <Text className="text-primary-300 text-[10px] mr-1">
          {t(`${key}.less`)}
        </Text>
        {LEVEL_CLASSES.map((level) => (
          <Box key={level} className={cn("size-3 rounded-[2px]", level)} />
        ))}
        <Text className="text-primary-300 text-[10px] ml-1">
          {t(`${key}.more`)}
        </Text>
      </HStack>
    </VStack>
  );
}

export function HourHeatmapSkeleton() {
  return (
    <Skeleton
      className="rounded-md h-24"
      variant="rounded"
      startColor="bg-primary-400"
      speed={4}
    />
  );
}
