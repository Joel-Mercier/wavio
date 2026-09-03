import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "expo-router";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HEADER_TINT, HEADER_TINT_COLOR } from "@/utils/headerGradient";

// Same RGB with zero alpha, not "transparent": fading towards rgba(0,0,0,0)
// darkens the midpoint (RGB and alpha both interpolate), which reads as a muddy
// band instead of a straight fade to the black background.
const COLORS = [
  HEADER_TINT_COLOR,
  `rgba(${HEADER_TINT.join(", ")}, 0)`,
] as const;
// Depth below the safe-area top at which the tint has fully faded out.
const HEIGHT = 300;

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// The tint as it appears `depth` px below the safe-area top, for overlays that
// have to blend into the gradient rather than into the black background — the
// horizontal edge fades on the chip rows. Returned as a [solid, transparent]
// pair since that is what those fades interpolate between.
export function tabHeaderTintAt(
  depth: number,
  insetTop: number,
): [string, string] {
  const remaining = Math.max(
    0,
    1 - (insetTop + depth) / Math.max(insetTop + HEIGHT, 1),
  );
  const [r, g, b] = HEADER_TINT.map((c) => Math.round(c * remaining));
  return [`rgb(${r}, ${g}, ${b})`, `rgba(${r}, ${g}, ${b}, 0)`];
}

// Anchored to the top of the screen and painted behind everything, so it stays
// put while the content scrolls over it. Render it as the first child of a
// screen root; headers that paint their own opaque background need
// TabHeaderGradientBackdrop on top of that background as well.
export default function TabHeaderGradient() {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={COLORS}
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: insets.top + HEIGHT,
      }}
    />
  );
}

interface TabHeaderGradientBackdropProps {
  // How far the parent header is currently translated up.
  offsetY: SharedValue<number>;
}

// The opaque background a collapsing header needs (so the list scrolling under
// it stays hidden), painted as the exact same stack the rest of the screen has:
// the scene's own background colour, then the tint on top, cancelling out the
// header's translation so the two halves of the gradient stay aligned as it
// collapses. Both layers matter — painting the header on any other colour (even
// one 9 units off, like --background over the navigator's rgb(1,1,1)) leaves a
// visible step at the header's bottom edge, because the tint is still partly
// transparent there and lets the difference through. Clipped to the header, so
// the slice below it keeps coming from TabHeaderGradient.
export function TabHeaderGradientBackdrop({
  offsetY,
}: TabHeaderGradientBackdropProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: offsetY.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        backgroundColor: colors.background,
      }}
    >
      <AnimatedLinearGradient
        colors={COLORS}
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: insets.top + HEIGHT,
          },
          style,
        ]}
      />
    </Animated.View>
  );
}
