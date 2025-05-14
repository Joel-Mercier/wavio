import { Event, useTrackPlayerEvents } from "react-native-track-player";

const events = [
  Event.PlaybackState,
  Event.PlaybackError,
  Event.PlaybackActiveTrackChanged,
];

export const useLogTrackPlayerState = () => {
  useTrackPlayerEvents(events, async (event) => {
    if (event.type === Event.PlaybackError) {
      console.warn("An error occurred:", event);
    }

    if (event.type === Event.PlaybackState) {
      console.log("Playback state changed:", event.state);
    }

    if (event.type === Event.PlaybackActiveTrackChanged) {
      if (event.track) {
        const { artwork, ...track } = event.track;
        console.log("Active track changed:", track);
      } else {
        console.log("No active track");
      }
    }
  });
};
