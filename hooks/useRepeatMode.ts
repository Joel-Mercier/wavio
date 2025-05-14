import { useEffect, useState } from "react";
import TrackPlayer, { type RepeatMode } from "react-native-track-player";

export const useRepeatMode = (): { repeatMode: RepeatMode | undefined, setRepeatMode: (repeatMode: RepeatMode) => void } => {
  const [repeatMode, setRepeatMode] = useState<RepeatMode | undefined>();

  // Sets the initial index (if still undefined)
  useEffect(() => {
    let unmounted = false;
    TrackPlayer.getRepeatMode()
      .then((initialRepeatMode) => {
        if (unmounted) return;
        setRepeatMode((repeatMode) => repeatMode ?? initialRepeatMode ?? undefined);
      })
      .catch(() => {
        // throws when you haven't yet setup, which is fine because it also
        // means there's no active track
      });
    return () => {
      unmounted = true;
    };
  }, []);

  return { repeatMode, setRepeatMode };
};