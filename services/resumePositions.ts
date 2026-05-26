import {
  createBookmark,
  deleteBookmark,
  getBookmarks,
} from "@/services/backend/bookmarks";
import { getCapabilities } from "@/services/backend/capabilities";
import { useAuthBase } from "@/stores/auth";
import type { QueueTrack } from "@/stores/queue";

// Resume positions are backed by Subsonic bookmarks, so they only make sense
// for content that actually lives on the Subsonic server: long tracks such as
// audiobooks, mixes and live sets. Short songs would just churn the bookmark
// list, and podcasts come from the Taddy API (their ids are unknown to the
// server), so both are excluded.
const RESUME_MIN_DURATION_SECONDS = 600; // 10 minutes
// Don't bookmark the very start, and treat the tail as "finished".
const RESUME_MIN_POSITION_SECONDS = 15;
const RESUME_END_GUARD_SECONDS = 15;
// Throttle server writes while a track plays.
const WRITE_THROTTLE_MS = 10_000;

// trackId -> last known position in seconds. Hydrated from getBookmarks and
// kept in sync as the user listens, so the player can resume without an async
// round-trip at load time.
const positions = new Map<string, number>();

let loaded = false;
let loadInFlight: Promise<void> | null = null;
let lastWriteAt = 0;
let lastWrittenId: string | null = null;
let lastWrittenPosition = 0;

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
  if (!bookmarksEnabled() || !isResumeEligible(track) || !track) return null;
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

// Throttled write while listening. Updates the in-memory map immediately so the
// UI/resume reflects reality even before the server write lands.
export function recordResumePosition(
  track: QueueTrack | null,
  positionSeconds: number,
  { force = false }: { force?: boolean } = {},
): void {
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
  lastWriteAt = now;
  lastWrittenId = track.id;
  lastWrittenPosition = positionSeconds;
  createBookmark(track.id, positionSeconds, {}).catch(() => {});
}

// Drop the bookmark once a track is fully played (or the user asks to).
export function clearResumePosition(trackId: string | null): void {
  if (!trackId) return;
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
}

let lastScope = `${useAuthBase.getState().url}::${useAuthBase.getState().username}`;
useAuthBase.subscribe((state) => {
  const scope = `${state.url}::${state.username}`;
  if (scope !== lastScope) {
    lastScope = scope;
    resetResumePositions();
  }
});
