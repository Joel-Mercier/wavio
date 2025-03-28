import TrackPlayer, { Capability, RepeatMode } from "@weights-ai/react-native-track-player";
import { useEffect, useState } from "react";

const setupTrackPlayer = async () => {
  await TrackPlayer.setupPlayer({
    maxCacheSize: 1024 * 10,
  });
  await TrackPlayer.updateOptions({
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.Stop,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
    ]
  })
  await TrackPlayer.setRepeatMode(RepeatMode.Off);
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
