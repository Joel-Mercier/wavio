import { useEffect } from "react";
import { Platform } from "react-native";
import { CarAutoBridge } from "@/services/carAuto/bridge";
import { setupCarPlay, updateCarPlayTree } from "@/services/carAuto/carplay";
import { handleBrowsePlay } from "@/services/carAuto/play";
import { buildBrowseTree } from "@/services/carAuto/tree";
import { useAuthBase } from "@/stores/auth";
import useRecentPlays from "@/stores/recentPlays";

const REBUILD_DEBOUNCE_MS = 500;

export default function CarAutoSync() {
  useEffect(() => {
    const teardownCarPlay = Platform.OS === "ios" ? setupCarPlay() : () => {};
    if (!CarAutoBridge.available && Platform.OS !== "ios") {
      return teardownCarPlay;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const rebuild = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        if (cancelled) return;
        const { url, username } = useAuthBase.getState();
        if (!url || !username) return;
        const tree = await buildBrowseTree().catch(() => null);
        if (cancelled || !tree) return;
        if (CarAutoBridge.available) CarAutoBridge.setTree(tree);
        if (Platform.OS === "ios") updateCarPlayTree(tree);
      }, REBUILD_DEBOUNCE_MS);
    };

    const unsubAuth = useAuthBase.subscribe(rebuild);
    const unsubRecent = useRecentPlays.subscribe(rebuild);
    const unsubPlay = CarAutoBridge.onPlay((mediaId) => {
      handleBrowsePlay(mediaId);
    });

    rebuild();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubAuth();
      unsubRecent();
      unsubPlay();
      teardownCarPlay();
    };
  }, []);

  return null;
}
