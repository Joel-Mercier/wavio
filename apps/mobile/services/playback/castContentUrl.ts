import { streamUrl } from "@/services/backend/streaming";
import { isPodcastTrack } from "@/services/podcastProgress";
import type { QueueTrack } from "@/stores/queue";
import { podcastStreamUrl } from "@/utils/podcastEpisodeToTrack";

// Three sources, three answers: internet radio streams its own absolute URL, a
// podcast episode streams a third-party enclosure or the server's podcast stream
// endpoint (never `streamUrl(episode id)` — a Taddy uuid means nothing to the
// server, and an OpenSubsonic episode streams through its `streamId`, not its
// own id), and a library track streams from the Subsonic endpoint for its id.
// Downloads are ignored on purpose: a receiver fetches the media itself.
export function castContentUrl(track: QueueTrack): string | undefined {
  if (track.isRadio) return track.streamUrl ?? track.url;
  if (isPodcastTrack(track)) return podcastStreamUrl(track);
  return streamUrl(track.id);
}
