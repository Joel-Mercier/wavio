import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "expo-router";
import type { ReactNode } from "react";
import { type StyleProp, StyleSheet, type ViewStyle } from "react-native";
import { Box } from "@/components/ui/box";
import { HEADER_TINT_STOPS } from "@/utils/headerGradient";

interface ScreenHeaderGradientProps {
  children: ReactNode;
  // Fixed height for the hero at the top of a list; omit to let the content
  // size the block, as the sticky bar does.
  height?: number;
  // Paints the scene background under the tint, for the sticky bar that has to
  // hide the list scrolling beneath it. The tint reaches zero alpha at the
  // bottom either way, so the block always ends on the page's own colour rather
  // than on an edge.
  opaque?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

// The tinted header block behind a detail screen's title: a hero at the top of
// the list, and the bar that sticks once it scrolls away. The gradient is a
// sibling behind the children rather than their parent, so the same component
// works whether the height is fixed or comes from the content.
export default function ScreenHeaderGradient({
  children,
  height,
  opaque = false,
  className,
  style,
}: ScreenHeaderGradientProps) {
  const { colors } = useTheme();

  return (
    <Box
      className={className}
      style={[
        opaque ? { backgroundColor: colors.background } : null,
        height === undefined ? null : { height },
        style,
      ]}
    >
      <LinearGradient
        colors={HEADER_TINT_STOPS.colors}
        locations={HEADER_TINT_STOPS.locations}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      {children}
    </Box>
  );
}
