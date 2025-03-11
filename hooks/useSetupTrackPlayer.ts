import TrackPlayer, { RepeatMode } from "@weights-ai/react-native-track-player";
import { useEffect, useRef, useState } from "react";

const setupTrackPlayer = async () => {
  await TrackPlayer.setupPlayer({
    maxCacheSize: 1024 * 10,
  });
  await TrackPlayer.setRepeatMode(RepeatMode.Queue);
};

export const useSetupTrackPlayer = () => {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    setupTrackPlayer()
      .then(() => {
        setIsInitialized(true);
      })
      .catch((error) => {
        setIsInitialized(false);
        console.error(error);
      });
  }, []);

  return isInitialized;
};
