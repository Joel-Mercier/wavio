import {
  addOrientationChangeListener,
  getOrientationAsync,
} from "expo-screen-orientation";
import { useAppBase } from "@/stores/app";

// Seeds the orientation store with the current value and keeps it in sync with
// device rotations. Wired once at the app root; returns a teardown that removes
// the listener.
export function initOrientation() {
  void getOrientationAsync().then((orientation) => {
    useAppBase.getState().setOrientation(orientation);
  });
  const subscription = addOrientationChangeListener((event) => {
    useAppBase.getState().setOrientation(event.orientationInfo.orientation);
  });
  return () => {
    subscription.remove();
  };
}
