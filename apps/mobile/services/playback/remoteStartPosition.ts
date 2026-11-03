import {
  getAudiobookResumePosition,
  isAudiobookTrack,
} from "@/services/audiobookPlayback";
import {
  getPodcastResumePosition,
  isPodcastTrack,
} from "@/services/podcastProgress";
import type { QueueTrack } from "@/stores/queue";

// Where a Cast receiver or renderer should start a track the queue just moved
// to. Music starts at the top; spoken word picks up where it was left, as it
// does on this device.
export function remoteStartPosition(track: QueueTrack): number {
  if (isAudiobookTrack(track)) return getAudiobookResumePosition(track) ?? 0;
  if (isPodcastTrack(track)) return getPodcastResumePosition(track) ?? 0;
  return 0;
}
