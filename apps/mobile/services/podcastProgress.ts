import { parseLocalPodcastEpisodeId } from "@/services/local/keys";
import { isActiveServerUrl } from "@/services/routeSwap";
import { currentAuthScope } from "@/stores/auth";
import {
  type PodcastProgressEntry,
  type PodcastSource,
  usePodcastsBase,
} from "@/stores/podcasts";
import type { QueueTrack } from "@/stores/queue";

// Where a podcast episode was left off, so replaying it resumes there. A
// parallel module to services/resumePositions.ts rather than an extension of it:
// that one is backed by Subsonic bookmarks (a capability Jellyfin and the local
// library lack, and meaningless for Taddy ids the server never saw), is disabled,
// and only ever resumes the track that was active at app launch. Podcasts want
// the opposite rule — any stored position resumes whenever the episode is played.

// A brief sample isn't "listening" — below this an episode still starts at 0.
const MIN_POSITION_SECONDS = 20;
// Within this of the end the episode counts as finished. A podcast tail (outros,
// credits) runs longer than music's, so this exceeds resumePositions' 15s.
const END_GUARD_SECONDS = 30;
// MMKV writes must not happen at the status listener's 4 Hz.
const WRITE_THROTTLE_MS = 10_000;
const MIN_DELTA_SECONDS = 5;

// One track plays at a time, so a single pending slot is enough. It holds the
// latest position in memory (free) between the throttled persist writes; the
// lastWritten* trio is what the throttle compares against, so the ~4 Hz stream
// of pending updates can't make every tick look like it "moved enough".
let pending: PodcastProgressEntry | null = null;
let lastWriteAt = 0;
let lastWrittenId: string | null = null;
let lastWrittenPosition = 0;

export function isPodcastTrack(track: QueueTrack | null): boolean {
  return !!track && !track.isRadio && track.source === "podcast";
}

// Both podcast id-spaces carry source: "podcast", so an entry needs a second
// discriminator. The track builders stamp `podcastSource` explicitly; the
// inference below is the fallback for tracks built by an older app version and
// restored from the persisted queue.
function resolvePodcastSource(track: QueueTrack): PodcastSource {
  if (track.podcastSource === "taddy" || track.podcastSource === "server") {
    return track.podcastSource;
  }
  if (typeof track.streamId === "string") return "server";
  if (typeof track.audioUrl === "string") return "taddy";
  // Last resort. A local/RSS episode's url is a *third-party* enclosure
  // (streamUrl decodes `local-pod-ep-` ids), so check the id shape first.
  if (parseLocalPodcastEpisodeId(track.id)) return "server";
  return isActiveServerUrl(track.url) ? "server" : "taddy";
}

function buildEntry(
  track: QueueTrack,
  position: number,
  duration: number,
): PodcastProgressEntry {
  const source = resolvePodcastSource(track);
  return {
    id: track.id,
    source,
    scope: source === "server" ? currentAuthScope() : undefined,
    streamId:
      source === "server"
        ? typeof track.streamId === "string"
          ? track.streamId
          : track.id
        : undefined,
    audioUrl:
      source === "taddy" && typeof track.audioUrl === "string"
        ? track.audioUrl
        : undefined,
    title: track.title,
    seriesName: track.artist,
    artwork: track.artwork,
    coverArt: track.coverArt,
    duration: duration > 0 ? duration : undefined,
    position,
    updatedAt: Date.now(),
    channelId:
      typeof track.channelId === "string" ? track.channelId : undefined,
    seriesUuid:
      typeof track.seriesUuid === "string" ? track.seriesUuid : undefined,
  };
}

// Position (seconds) to resume `track` at, or null when there's nothing stored.
// Reads `pending` before the store: playTracks short-circuits to loadAndPlay
// when the tapped track is already current, without the queue subscription
// firing, so replaying the same episode inside the throttle window would
// otherwise resume from a position up to a full window stale.
export function getPodcastResumePosition(
  track: QueueTrack | null,
): number | null {
  if (!isPodcastTrack(track) || !track) return null;
  if (pending?.id === track.id) {
    return pending.position >= MIN_POSITION_SECONDS ? pending.position : null;
  }
  const entry = usePodcastsBase
    .getState()
    .podcastProgress.find((item) => item.id === track.id);
  if (!entry || entry.position < MIN_POSITION_SECONDS) return null;
  return entry.position;
}

export function recordPodcastProgress(
  track: QueueTrack | null,
  positionSeconds: number,
  {
    duration,
    force = false,
  }: { duration?: number | null; force?: boolean } = {},
): void {
  if (!isPodcastTrack(track) || !track) return;
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) return;
  // The player's status duration knows the real length even when a feed lied or
  // declared nothing, so it wins over the track's.
  const dur =
    duration != null && Number.isFinite(duration) && duration > 0
      ? duration
      : (track.duration ?? 0);
  // Finished (or scrubbed into the tail): drop the entry immediately, never
  // throttled, so Resume listening can't reopen an episode at its credits.
  if (dur > 0 && positionSeconds >= dur - END_GUARD_SECONDS) {
    clearPodcastProgress(track.id);
    return;
  }
  // Below the floor, do nothing — and crucially do NOT clear. The first status
  // ticks after a resume load report ~0 before the armed seek lands, so clearing
  // here would erase the entry we are in the middle of resuming from.
  if (positionSeconds < MIN_POSITION_SECONDS) return;

  const entry = buildEntry(track, positionSeconds, dur);
  pending = entry;

  const now = Date.now();
  const changedTrack = lastWrittenId !== entry.id;
  const movedEnough =
    Math.abs(positionSeconds - lastWrittenPosition) >= MIN_DELTA_SECONDS;
  if (
    !force &&
    !changedTrack &&
    (now - lastWriteAt < WRITE_THROTTLE_MS || !movedEnough)
  ) {
    return;
  }
  write(entry);
}

function write(entry: PodcastProgressEntry): void {
  lastWriteAt = Date.now();
  lastWrittenId = entry.id;
  lastWrittenPosition = entry.position;
  usePodcastsBase.getState().setPodcastProgress(entry);
}

export function clearPodcastProgress(trackId: string | null): void {
  if (!trackId) return;
  if (pending?.id === trackId) pending = null;
  if (lastWrittenId === trackId) {
    lastWrittenId = null;
    lastWrittenPosition = 0;
  }
  usePodcastsBase.getState().clearPodcastProgress(trackId);
}

// Persist whatever is in memory. Called on pause, on track change and when the
// app goes to the background, so an ordinary exit doesn't drop a position.
export function flushPodcastProgress(): void {
  if (!pending) return;
  write(pending);
}

// Drop the in-flight slot when the player is torn down (scope change). The
// store itself is global and deliberately survives — Taddy progress is
// server-independent, exactly like Taddy favorites.
export function resetPodcastProgressRuntime(): void {
  pending = null;
  lastWriteAt = 0;
  lastWrittenId = null;
  lastWrittenPosition = 0;
}
