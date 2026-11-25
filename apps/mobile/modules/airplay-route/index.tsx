import { requireNativeView, requireOptionalNativeModule } from "expo";
import type { ComponentType } from "react";
import { Platform, type ViewProps } from "react-native";

export type AudioRoute = {
  /** The output's own name: "Living Room", "AirPods Pro", "iPhone". */
  name: string;
  airPlay: boolean;
  /** Anything but the phone's own speaker or earpiece. */
  external: boolean;
};

type AirPlayRouteNativeModule = {
  currentRoute(): AudioRoute;
  addListener(
    event: "onRouteChange",
    listener: (route: AudioRoute) => void,
  ): { remove: () => void };
};

type AirPlayRouteButtonProps = ViewProps & {
  tint?: string;
  activeTint?: string;
};

// iOS only: Android has no AirPlay sender, and its outputs are listed by the
// output sheet itself.
const Native =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<AirPlayRouteNativeModule>("AirPlayRoute")
    : null;

let NativeButton: ComponentType<AirPlayRouteButtonProps> | null = null;

export const isAirPlayAvailable = (): boolean => Native != null;

export function currentAudioRoute(): AudioRoute | null {
  try {
    return Native?.currentRoute() ?? null;
  } catch {
    return null;
  }
}

export function subscribeAudioRoute(
  listener: (route: AudioRoute) => void,
): () => void {
  const subscription = Native?.addListener("onRouteChange", listener);
  return () => subscription?.remove();
}

/** The system's AirPlay button. Opens iOS's own route picker when tapped. */
export function AirPlayRouteButton(props: AirPlayRouteButtonProps) {
  if (!Native) return null;
  NativeButton ??= requireNativeView<AirPlayRouteButtonProps>("AirPlayRoute");
  return <NativeButton {...props} />;
}
