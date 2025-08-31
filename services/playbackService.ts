import {
  AudioPro,
  AudioProContentType,
  AudioProEventType,
} from "react-native-audio-pro";

export function setupAudio() {
  // Configure audio settings
  AudioPro.configure({
    contentType: AudioProContentType.MUSIC,
    debug: __DEV__,
    debugIncludesProgress: false,
    progressIntervalMs: 1000,
    showNextPrevControls: true,
    showSkipControls: true,
  });

  AudioPro.addEventListener((event) => {
    switch (event.type) {
      case AudioProEventType.TRACK_ENDED:
        // Auto-play next track when current track ends
        break;

      case AudioProEventType.SEEK_COMPLETE:
        // Handle seek complete event
        break;

      case AudioProEventType.PLAYBACK_ERROR:
        // Handle playback error event
        break;

      case AudioProEventType.REMOTE_PREV:
        // Handle previous button press from lock screen/notification
        break;

      case AudioProEventType.REMOTE_NEXT:
        // Handle next button press from lock screen/notification
        break;
    }
  });
}
