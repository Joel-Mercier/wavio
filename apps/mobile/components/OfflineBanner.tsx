import NetInfo from "@react-native-community/netinfo";
import Wifi from "lucide-react-native/dist/esm/icons/wifi.mjs";
import WifiOff from "lucide-react-native/dist/esm/icons/wifi-off.mjs";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";

const BANNER_HEIGHT = 32;
const BACK_ONLINE_DURATION = 2000;

type Mode = "hidden" | "offline" | "online";

export default function OfflineBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("hidden");
  const wasOffline = useRef(false);
  const translateY = useSharedValue(-200);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !state.isConnected;
      if (offline) {
        wasOffline.current = true;
        setMode("offline");
      } else if (wasOffline.current) {
        wasOffline.current = false;
        setMode("online");
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (mode === "hidden") {
      return;
    }
    translateY.value = withTiming(0, {
      duration: 250,
      easing: Easing.out(Easing.cubic),
    });

    if (mode === "online") {
      translateY.value = withDelay(
        BACK_ONLINE_DURATION,
        withTiming(
          -200,
          { duration: 250, easing: Easing.in(Easing.cubic) },
          (finished) => {
            if (finished) {
              runOnJS(setMode)("hidden");
            }
          },
        ),
      );
    }
  }, [mode, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (mode === "hidden") {
    return null;
  }

  const isOnline = mode === "online";

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          backgroundColor: isOnline ? "#16a34a" : "#dc2626",
        },
        animatedStyle,
      ]}
    >
      <HStack
        space="sm"
        className="items-center justify-center"
        style={{ height: BANNER_HEIGHT }}
      >
        {isOnline ? (
          <Wifi color="white" size={14} />
        ) : (
          <WifiOff color="white" size={14} />
        )}
        <Text className="text-white text-sm font-bold">
          {isOnline
            ? t("app.offlineBanner.backOnline")
            : t("app.offlineBanner.noConnection")}
        </Text>
      </HStack>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
  },
});
