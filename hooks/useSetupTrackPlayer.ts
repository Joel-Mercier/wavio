import { useEffect, useState } from "react";
import TrackPlayer, { AndroidAudioContentType, Capability, RepeatMode } from "react-native-track-player";

const setupTrackPlayer = async () => {
  await TrackPlayer.setupPlayer({
    maxCacheSize: 1024 * 10,
    autoHandleInterruptions: true,
    androidAudioContentType: AndroidAudioContentType.Music,
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
    if (!isInitialized) {
      setupTrackPlayer()
        .then(() => {
          setIsInitialized(true);
        })
        .catch((error) => {
          console.log(error)
          setIsInitialized(false);
          console.error(error);
        });
    }
  }, [isInitialized]);

  return isInitialized;
};
