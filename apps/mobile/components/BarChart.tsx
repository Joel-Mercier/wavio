import { FlashList } from "@shopify/flash-list";
import { memo } from "react";
import { useWindowDimensions } from "react-native";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { cn } from "@/utils/tailwind";

export const BAR_CHART_HEIGHT = 128;
// Enough of a stub that an empty bar still reads as a bar rather than a gap in
// the axis.
const MIN_BAR_HEIGHT = 2;
// Room for a short label under each bar ("Mon", "1990s", "janv.").
const MIN_BAR_WIDTH = 40;
const BAR_GAP = 2;
// The label line under the bars, plus the gap above it. The scrolling chart has
// to be given a height — it is a list, and a list inside a ScrollView has no
// height of its own — so this has to cover the tallest label line rather than
// be tight against it: whatever it does not cover is simply clipped away.
const AXIS_HEIGHT = 32;
// Horizontal padding of the screens this is used on. Escaped when the chart
// scrolls, so it runs to both edges the way the home carousels do, and put back
// as content padding so the first bar still lines up with the text above.
const SCREEN_PADDING = 24;

export type BarSegment = {
  key: string;
  value: number;
  // A hex colour, not a class: the palette is a data-driven list, and Tailwind
  // can only ship classes it saw in the source.
  color: string;
};

export type Bar = {
  key: string;
  label: string;
  value: number;
  // Splits the bar into stacked parts, bottom-first. Their values are expected
  // to add up to `value`, which is what the bar is scaled by.
  segments?: BarSegment[];
  // Read out instead of the label, which is abbreviated to fit the axis.
  accessibilityLabel?: string;
};

const BarColumn = memo(function BarColumn({
  bar,
  max,
  height,
  width,
}: {
  bar: Bar;
  max: number;
  height: number;
  // A fixed width when the chart scrolls; undefined lets the column flex to
  // fill the width instead.
  width?: number;
}) {
  const barHeight =
    max > 0
      ? Math.max(MIN_BAR_HEIGHT, (bar.value / max) * height)
      : MIN_BAR_HEIGHT;

  return (
    <VStack
      accessibilityLabel={bar.accessibilityLabel ?? bar.label}
      style={width === undefined ? { flex: 1 } : { width }}
    >
      <Box className="justify-end" style={{ height }}>
        {bar.segments ? (
          // Stacked, bottom-first, with a hairline of surface between parts so
          // two adjacent colours never read as one band.
          <VStack className="justify-end gap-y-[1px]">
            {bar.segments
              .filter((segment) => segment.value > 0)
              .reverse()
              .map((segment) => (
                <Box
                  key={segment.key}
                  className="rounded-[1px]"
                  style={{
                    height: Math.max(
                      1,
                      (segment.value / Math.max(bar.value, 1)) * barHeight,
                    ),
                    backgroundColor: segment.color,
                  }}
                />
              ))}
          </VStack>
        ) : (
          <Box
            className={cn(
              "rounded-sm",
              bar.value > 0 ? "bg-emerald-500" : "bg-primary-600",
            )}
            style={{ height: barHeight }}
          />
        )}
      </Box>
      <Text
        className="text-primary-300 text-[10px] text-center mt-2"
        numberOfLines={1}
      >
        {bar.label}
      </Text>
    </VStack>
  );
});

/**
 * A column chart of labelled values.
 *
 * Two layouts, chosen by whether the bars fit: few enough and they flex to fill
 * the width; too many and the chart becomes a horizontally scrolling list of
 * fixed-width columns. The fixed width is what keeps a label legible — dividing
 * the screen by sixty bars gives each one three pixels and labels nothing — and
 * the list is virtualised, because sixty columns of stacked segments is several
 * hundred views to drag around otherwise.
 */
export default function BarChart({
  bars,
  height = BAR_CHART_HEIGHT,
  minBarWidth = MIN_BAR_WIDTH,
}: {
  bars: Bar[];
  height?: number;
  minBarWidth?: number;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const max = bars.reduce((peak, bar) => Math.max(peak, bar.value), 0);
  const fits =
    bars.length * (minBarWidth + BAR_GAP) <= screenWidth - SCREEN_PADDING * 2;

  if (fits) {
    return (
      <HStack className="gap-x-[2px] py-2">
        {bars.map((bar) => (
          <BarColumn key={bar.key} bar={bar} max={max} height={height} />
        ))}
      </HStack>
    );
  }

  return (
    <Box
      // Margin, not padding: padding would eat into the fixed height below and
      // clip the very labels the scrolling layout exists to make room for.
      className="my-2"
      style={{
        marginHorizontal: -SCREEN_PADDING,
        height: height + AXIS_HEIGHT,
      }}
    >
      <FlashList
        horizontal
        data={bars}
        keyExtractor={(bar) => bar.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING }}
        renderItem={({ item }) => (
          <Box style={{ marginRight: BAR_GAP }}>
            <BarColumn
              bar={item}
              max={max}
              height={height}
              width={minBarWidth}
            />
          </Box>
        )}
      />
    </Box>
  );
}

/**
 * Names the colours of a stacked chart.
 *
 * Always shown alongside one: colour is the only thing distinguishing the
 * bands, and colour alone is not an encoding a colour-blind reader can use.
 * The text stays in the muted ink of every other label — the swatch beside it
 * carries the identity, so a legend never becomes a row of coloured words.
 */
export function BarChartLegend({
  items,
}: {
  items: { key: string; label: string; color: string }[];
}) {
  return (
    <HStack className="flex-wrap gap-x-3 gap-y-1">
      {items.map((item) => (
        <HStack key={item.key} className="items-center gap-x-1">
          <Box
            className="size-2 rounded-[2px]"
            style={{ backgroundColor: item.color }}
          />
          <Text className="text-primary-300 text-[10px]" numberOfLines={1}>
            {item.label}
          </Text>
        </HStack>
      ))}
    </HStack>
  );
}

export function BarChartSkeleton({
  height = BAR_CHART_HEIGHT,
}: {
  height?: number;
}) {
  return (
    <Skeleton
      className="rounded-md"
      variant="rounded"
      startColor="bg-primary-400"
      speed={4}
      style={{ height }}
    />
  );
}
