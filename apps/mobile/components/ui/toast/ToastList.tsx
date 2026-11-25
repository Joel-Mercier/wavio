import { Overlay } from "@gluestack-ui/core/overlay/creator";
import { useKeyboardBottomInset } from "@gluestack-ui/utils/hooks";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Animated, type StyleProp, View, type ViewStyle } from "react-native";
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { exitToast, type ToastPlacement, useToastStore } from "./store";

const ANIMATION_DURATION = 150;
const ENTER_OFFSET = 24;

const POSITIONS: Record<ToastPlacement, ViewStyle> = {
  top: { top: 0, left: 0, right: 0, alignItems: "center" },
  "top right": { top: 0, right: 0, alignItems: "flex-end" },
  "top left": { top: 0, left: 0, alignItems: "flex-start" },
  bottom: { bottom: 0, left: 0, right: 0, alignItems: "center" },
  "bottom left": { bottom: 0, left: 0, alignItems: "flex-start" },
  "bottom right": { bottom: 0, right: 0, alignItems: "flex-end" },
};

const isBottom = (placement: ToastPlacement) => placement.startsWith("bottom");

export function ToastList() {
  const toastInfo = useToastStore((state) => state.toastInfo);
  const visibleToasts = useToastStore((state) => state.visibleToasts);
  const bottomInset = useKeyboardBottomInset() * 2;

  const placements = (Object.keys(toastInfo) as ToastPlacement[]).filter(
    (placement) => placement in POSITIONS,
  );
  if (placements.length === 0) return null;
  const hasToasts = placements.some(
    (placement) => (toastInfo[placement]?.length ?? 0) > 0,
  );

  return (
    <Overlay isOpen={hasToasts} isKeyboardDismissable={false}>
      {placements.map((placement) => (
        <View
          key={placement}
          style={[
            {
              justifyContent: "center",
              margin: "auto",
              position: "absolute",
              pointerEvents: "box-none",
            },
            POSITIONS[placement],
          ]}
        >
          {toastInfo[placement]?.map((toast) => (
            <SafeAreaProvider
              key={toast.id}
              initialMetrics={initialWindowMetrics}
            >
              <SafeAreaView style={{ pointerEvents: "box-none" }}>
                <AnimatedToastView
                  id={toast.id}
                  visible={visibleToasts[toast.id] === true}
                  placement={placement}
                  containerStyle={toast.config.containerStyle}
                  bottomInset={
                    isBottom(placement) && toast.config.avoidKeyboard
                      ? bottomInset
                      : undefined
                  }
                >
                  {toast.component}
                </AnimatedToastView>
              </SafeAreaView>
            </SafeAreaProvider>
          ))}
        </View>
      ))}
    </Overlay>
  );
}

function AnimatedToastView({
  id,
  visible,
  placement,
  containerStyle,
  bottomInset,
  children,
}: {
  id: string;
  visible: boolean;
  placement: ToastPlacement;
  containerStyle?: StyleProp<ViewStyle>;
  bottomInset?: number;
  children: React.ReactNode;
}) {
  const hiddenOffset = isBottom(placement) ? ENTER_OFFSET : -ENTER_OFFSET;
  const [opacity] = useState(() => new Animated.Value(visible ? 1 : 0));
  const [translateY] = useState(
    () => new Animated.Value(visible ? 0 : hiddenOffset),
  );
  const previousVisible = useRef<boolean | null>(null);

  useEffect(() => {
    const wasVisible = previousVisible.current;
    previousVisible.current = visible;
    if (wasVisible === null) {
      if (!visible) exitToast(id);
      return;
    }
    if (wasVisible === visible) return;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: visible ? 0 : hiddenOffset,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && !visible) exitToast(id);
    });
  }, [visible, id, opacity, translateY, hiddenOffset]);

  return (
    <Animated.View
      style={[
        { opacity, transform: [{ translateY }], pointerEvents: "box-none" },
        containerStyle,
      ]}
    >
      <View style={{ bottom: bottomInset }}>{children}</View>
    </Animated.View>
  );
}
