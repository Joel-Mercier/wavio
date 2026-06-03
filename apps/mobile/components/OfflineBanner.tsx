import ServerOff from "lucide-react-native/dist/esm/icons/server-off.mjs";
import WifiOff from "lucide-react-native/dist/esm/icons/wifi-off.mjs";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { useIsDeviceOnline, useIsOnline } from "@/hooks/useIsOnline";

// Height of the offline strip rendered at the bottom of the tab bar gradient,
// just below the tab icons. The tab bar grows by this amount while offline (see
// (tabs)/_layout.tsx) so the strip sits inside the dark part of the gradient,
// and the floating player shifts up to match.
export const OFFLINE_BANNER_HEIGHT = 24;

// Rendered inside the tab bar's LinearGradient background. Shows a centered
// "no connection" line on the dark part of the gradient while offline.
export default function OfflineBanner() {
  const { t } = useTranslation();
  // Effective: hidden only when the device is online AND the server is reachable.
  const isOnline = useIsOnline();
  // Raw device connectivity, to choose the message: "no internet" vs the device
  // being online but the server unreachable (e.g. its LAN IP changed).
  const isDeviceOnline = useIsDeviceOnline();
  const insets = useSafeAreaInsets();
  const hiddenOffset = OFFLINE_BANNER_HEIGHT + insets.bottom;
  const translateY = useSharedValue(hiddenOffset);

  useEffect(() => {
    translateY.value = withTiming(isOnline ? hiddenOffset : 0, {
      duration: 250,
      easing: Easing.out(Easing.cubic),
    });
  }, [isOnline, hiddenOffset, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: 1 - translateY.value / hiddenOffset,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { bottom: insets.bottom, height: OFFLINE_BANNER_HEIGHT },
        animatedStyle,
      ]}
    >
      <HStack space="xs" className="items-center justify-center">
        {isDeviceOnline ? (
          <ServerOff color="white" size={14} />
        ) : (
          <WifiOff color="white" size={14} />
        )}
        <Text className="text-white text-sm text-center">
          {isDeviceOnline
            ? t("app.offlineBanner.serverUnreachable")
            : t("app.offlineBanner.noConnection")}
        </Text>
      </HStack>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
