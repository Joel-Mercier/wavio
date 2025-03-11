import TrackPlayer, { Event } from "@weights-ai/react-native-track-player";
const PlaybackService = async () => {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());

  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
};

export default PlaybackService;
