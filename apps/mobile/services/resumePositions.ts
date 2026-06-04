import {
  createBookmark,
  deleteBookmark,
  getBookmarks,
} from "@/services/backend/bookmarks";
import { getCapabilities } from "@/services/backend/capabilities";
import { useAuthBase } from "@/stores/auth";
import type { QueueTrack } from "@/stores/queue";

// Resume positions are backed by Subsonic bookmarks, so they only make sense
// for content that actually lives on the Subsonic server and podcasts come
// from the Taddy API (their ids are unknown to the server), so both are excluded.
const RESUME_MIN_DURATION_SECONDS = 600; // 10 minutes
// Don't bookmark the very start, and treat the tail as "finished".
const RESUME_MIN_POSITION_SECONDS = 15;
const RESUME_END_GUARD_SECONDS = 15;
// Throttle server writes while a track plays.
const WRITE_THROTTLE_MS = 10_000;

// Position resuming is temporarily disabled: replaying a previously abandoned
// track jumped to a random offset the user no longer cares about. Flip this back
// to re-enable reads/writes once it only resumes the track that was active at
// app launch rather than every bookmarked track.
const RESUME_ENABLED = false;

// trackId -> last known position in seconds. Hydrated from getBookmarks and
// kept in sync as the user listens, so the player can resume without an async
// round-trip at load time.
const positions = new Map<string, number>();

let loaded = false;
let loadInFlight: Promise<void> | null = null;
let lastWriteAt = 0;
let lastWrittenId: string | null = null;
let lastWrittenPosition = 0;

// Only the track that was active at app launch may be resumed. Replaying a
// previously abandoned track should start from 0 (the user picked it on purpose
// and doesn't remember/care where they wandered off last time), so a stored
// bookmark is honoured exclusively for this id. Set once during cold-start
// hydration and cleared the moment that track finishes or the user moves on.
let resumeArmedId: string | null = null;

function bookmarksEnabled(): boolean {
  return getCapabilities(useAuthBase.getState().serverType).bookmarks;
}

export function isResumeEligible(track: QueueTrack | null): boolean {
  if (!track) return false;
  if (track.isRadio) return false;
  // Podcasts come from Taddy, not the Subsonic server — bookmarking them is
  // useless, so they're never eligible.
  if (track.source === "podcast") return false;
  return (track.duration ?? 0) >= RESUME_MIN_DURATION_SECONDS;
}

// Pull the user's bookmarks into the in-memory map. Safe to call repeatedly;
// only the first call hits the network until reset() is invoked.
export async function loadResumePositions(): Promise<void> {
  if (!RESUME_ENABLED) return;
  if (!bookmarksEnabled()) return;
  if (loaded) return;
  if (loadInFlight) return loadInFlight;
  loadInFlight = (async () => {
    try {
      const rsp = await getBookmarks();
      positions.clear();
      for (const bookmark of rsp.bookmarks?.bookmark ?? []) {
        const id = bookmark.entry?.id;
        if (id != null) positions.set(id, bookmark.position ?? 0);
      }
      loaded = true;
    } catch {
      // Leave `loaded` false so a later call retries.
    } finally {
      loadInFlight = null;
    }
  })();
  return loadInFlight;
}

// Position (seconds) to resume `track` at, or null when there's nothing useful
// to restore (no bookmark, ineligible, too close to start/end).
export function getResumePosition(track: QueueTrack | null): number | null {
  if (!RESUME_ENABLED) return null;
  if (!bookmarksEnabled() || !isResumeEligible(track) || !track) return null;
  // Resume only the launch track — every other bookmarked track starts at 0.
  if (track.id !== resumeArmedId) return null;
  const position = positions.get(track.id);
  if (position == null || position < RESUME_MIN_POSITION_SECONDS) return null;
  const duration = track.duration ?? 0;
  if (duration > 0 && position >= duration - RESUME_END_GUARD_SECONDS) {
    return null;
  }
  return position;
}

export function getResumeProgress(track: QueueTrack | null): number | null {
  const position = getResumePosition(track);
  const duration = track?.duration ?? 0;
  if (position == null || duration <= 0) return null;
  return Math.min(1, position / duration);
}

// Mark `trackId` as the launch track eligible for resume. Called once at
// cold-start hydration with the restored current track.
export function armResume(trackId: string | null): void {
  resumeArmedId = trackId;
}

// Note which track playback has moved to. Once the active track is no longer the
// armed launch track, drop the arming so returning to it later starts at 0.
export function notePlaybackTrack(trackId: string | null): void {
  if (resumeArmedId != null && trackId !== resumeArmedId) {
    resumeArmedId = null;
  }
}

// Throttled write while listening. Updates the in-memory map immediately so the
// UI/resume reflects reality even before the server write lands.
export function recordResumePosition(
  track: QueueTrack | null,
  positionSeconds: number,
  { force = false }: { force?: boolean } = {},
): void {
  if (!RESUME_ENABLED) return;
  if (!bookmarksEnabled() || !isResumeEligible(track) || !track) return;
  if (positionSeconds < RESUME_MIN_POSITION_SECONDS) return;
  const duration = track.duration ?? 0;
  if (duration > 0 && positionSeconds >= duration - RESUME_END_GUARD_SECONDS) {
    // Near the end — let the finish handler clear it instead.
    return;
  }
  positions.set(track.id, positionSeconds);
  const now = Date.now();
  const changedTrack = lastWrittenId !== track.id;
  const movedEnough = Math.abs(positionSeconds - lastWrittenPosition) >= 5;
  if (
    !force &&
    !changedTrack &&
    (now - lastWriteAt < WRITE_THROTTLE_MS || !movedEnough)
  ) {
    return;
  }
  // Keep a single resume bookmark on the server: when recording moves to a new
  // track, drop the previous track's bookmark before writing the new one.
  if (changedTrack && lastWrittenId != null) {
    const previousId = lastWrittenId;
    positions.delete(previousId);
    deleteBookmark(previousId).catch(() => {});
  }
  lastWriteAt = now;
  lastWrittenId = track.id;
  lastWrittenPosition = positionSeconds;
  createBookmark(track.id, positionSeconds, {}).catch(() => {});
}

// Drop the bookmark once a track is fully played (or the user asks to).
export function clearResumePosition(trackId: string | null): void {
  if (!trackId) return;
  if (resumeArmedId === trackId) resumeArmedId = null;
  if (!positions.has(trackId)) return;
  positions.delete(trackId);
  if (lastWrittenId === trackId) lastWrittenId = null;
  if (!bookmarksEnabled()) return;
  deleteBookmark(trackId).catch(() => {});
}

// Reset everything when the active server/user changes so positions don't bleed
// across accounts.
export function resetResumePositions(): void {
  positions.clear();
  loaded = false;
  loadInFlight = null;
  lastWriteAt = 0;
  lastWrittenId = null;
  lastWrittenPosition = 0;
  resumeArmedId = null;
}

let lastScope = `${useAuthBase.getState().url}::${useAuthBase.getState().username}`;
useAuthBase.subscribe((state) => {
  const scope = `${state.url}::${state.username}`;
  if (scope !== lastScope) {
    lastScope = scope;
    resetResumePositions();
  }
});
