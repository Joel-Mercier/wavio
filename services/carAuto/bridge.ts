import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import type { BrowseTree } from "./types";

// The Android native module is provided by `modules/car-auto` (registered as
// CarAuto). On iOS the bridge is a no-op; CarPlay is handled in
// services/carAuto/carplay.ts via react-native-carplay.
const NativeCarAuto: {
  setTree: (json: string) => void;
} | null =
  Platform.OS === "android"
    ? ((NativeModules.CarAuto as
        | { setTree: (json: string) => void }
        | undefined) ?? null)
    : null;

const emitter =
  Platform.OS === "android" && NativeCarAuto
    ? new NativeEventEmitter(NativeModules.CarAuto)
    : null;

export const CarAutoBridge = {
  available: NativeCarAuto != null,
  setTree(tree: BrowseTree) {
    if (!NativeCarAuto) return;
    try {
      NativeCarAuto.setTree(JSON.stringify(tree));
    } catch {}
  },
  onPlay(handler: (mediaId: string) => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener("play", (event: { mediaId: string }) => {
      if (event?.mediaId) handler(event.mediaId);
    });
    return () => sub.remove();
  },
};
