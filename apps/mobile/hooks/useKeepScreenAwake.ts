import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect } from "react";
import { logError } from "@/utils/log";

export function useKeepScreenAwake(enabled: boolean, tag: string) {
  useEffect(() => {
    if (!enabled) return;
    activateKeepAwakeAsync(tag).catch(logError);
    return () => {
      deactivateKeepAwake(tag).catch(logError);
    };
  }, [enabled, tag]);
}
