import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Measured inside the safe area: on a square screen (Unihertz Titan 2) the
// system bars are what make the usable area wider than tall.
export function useIsTwoColumnPlayer() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    width - insets.left - insets.right > height - insets.top - insets.bottom
  );
}
