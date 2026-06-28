import {
  addOrientationChangeListener,
  getOrientationAsync,
} from "expo-screen-orientation";
import { Dimensions } from "react-native";
import { useAppBase } from "@/stores/app";

// Seeds the orientation + window-width store with the current values and keeps
// them in sync with device rotations and window resizes (foldables, Android
// split-screen). Together they drive `isWideLayout`. Wired once at the app root;
// returns a teardown that removes both listeners.
export function initOrientation() {
  void getOrientationAsync().then((orientation) => {
    useAppBase.getState().setOrientation(orientation);
  });
  useAppBase.getState().setWindowWidth(Dimensions.get("window").width);

  const orientationSubscription = addOrientationChangeListener((event) => {
    useAppBase.getState().setOrientation(event.orientationInfo.orientation);
  });
  const dimensionsSubscription = Dimensions.addEventListener(
    "change",
    ({ window }) => {
      useAppBase.getState().setWindowWidth(window.width);
    },
  );
  return () => {
    orientationSubscription.remove();
    dimensionsSubscription.remove();
  };
}
