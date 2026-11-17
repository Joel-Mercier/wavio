import { getNoBackupStorage } from "@/config/storage";
import {
  createBookmark,
  deleteBookmark,
  getBookmarks,
} from "@/services/backend/bookmarks";
import { getCapabilities } from "@/services/backend/capabilities";
import { currentAuthScope, useAuthBase } from "@/stores/auth";
import type { QueueTrack } from "@/stores/queue";
import { isLibraryTrack, isSpokenWordTrack } from "@/utils/trackSource";

// Bookmarks only make sense for content that actually lives on the Subsonic
// server: radio and podcasts (Taddy ids are unknown to the server) are excluded.
const RESUME_MIN_DURATION_SECONDS = 600; // 10 minutes
// Don't bookmark the very start, and treat the tail as "finished".
const RESUME_MIN_POSITION_SECONDS = 15;
const RESUME_END_GUARD_SECONDS = 15;
// Throttle server writes while a track plays.
const WRITE_THROTTLE_MS = 10_000;

// Server bookmarks stay off: replaying a previously abandoned track jumped to a
// random offset the user no longer cares about. The launch track resumes from
// the position saved on the device instead (savePosition below).
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

// The current track's position, saved on the device for every server type so a
// restart (an app kill, or a car reconnecting to a process that died meanwhile)
// picks the launch track up where it was. One entry per scope, outside backups:
// it changes every few seconds of listening and means nothing on another phone.
const SAVED_POSITION_STORAGE_ID = "playbackPosition";
const SAVED_MIN_POSITION_SECONDS = 5;
const SAVED_END_GUARD_SECONDS = 10;
const SAVED_WRITE_THROTTLE_MS = 5_000;

type SavedPosition = { id: string; position: number };

let lastSavedAt = 0;
let lastSavedId: string | null = null;
let lastSavedPosition = 0;

const savedPositionStorage = () =>
  getNoBackupStorage(SAVED_POSITION_STORAGE_ID);

function readSavedPosition(): SavedPosition | null {
  try {
    const raw = savedPositionStorage().getString(currentAuthScope());
    return raw ? (JSON.parse(raw) as SavedPosition) : null;
  } catch {
    return null;
  }
}

function savedPositionFor(track: QueueTrack): number | null {
  if (!isLibraryTrack(track)) return null;
  const saved = readSavedPosition();
  if (saved?.id !== track.id) return null;
  if (saved.position < SAVED_MIN_POSITION_SECONDS) return null;
  const duration = track.duration ?? 0;
  if (duration > 0 && saved.position >= duration - SAVED_END_GUARD_SECONDS) {
    return null;
  }
  return saved.position;
}

function savePosition(
  track: QueueTrack,
  positionSeconds: number,
  force: boolean,
): void {
  if (!isLibraryTrack(track)) return;
  if (positionSeconds < SAVED_MIN_POSITION_SECONDS) return;
  // A pause is saved twice, by pause() and by the status it causes.
  if (
    lastSavedId === track.id &&
    Math.abs(positionSeconds - lastSavedPosition) < 1
  ) {
    return;
  }
  const now = Date.now();
  if (
    !force &&
    lastSavedId === track.id &&
    now - lastSavedAt < SAVED_WRITE_THROTTLE_MS
  ) {
    return;
  }
  lastSavedAt = now;
  lastSavedId = track.id;
  lastSavedPosition = positionSeconds;
  try {
    savedPositionStorage().set(
      currentAuthScope(),
      JSON.stringify({ id: track.id, position: positionSeconds }),
    );
  } catch {
    // Best-effort: losing it only means the next launch starts the track at 0.
  }
}

function forgetSavedPosition(trackId: string): void {
  if (readSavedPosition()?.id !== trackId) return;
  lastSavedId = null;
  savedPositionStorage().remove(currentAuthScope());
}

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
  if (isSpokenWordTrack(track)) return false;
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
  // Resume only the launch track — every other track starts at 0.
  if (!track || track.id !== resumeArmedId) return null;
  const saved = savedPositionFor(track);
  if (saved != null) return saved;
  if (!RESUME_ENABLED) return null;
  if (!bookmarksEnabled() || !isResumeEligible(track)) return null;
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

// Makes `track` the one to resume, at a position from elsewhere (the server's
// play queue) that replaces whatever was saved on the device for it.
export function armResumeAt(track: QueueTrack, positionSeconds: number): void {
  resumeArmedId = track.id;
  forgetSavedPosition(track.id);
  savePosition(track, positionSeconds, true);
}

// Note which track playback has moved to. Once the active track is no longer the
// armed launch track, drop the arming so returning to it later starts at 0.
export function notePlaybackTrack(trackId: string | null): void {
  if (resumeArmedId != null && trackId !== resumeArmedId) {
    resumeArmedId = null;
  }
}

// `trackId` is being loaded from the start, so a position saved for an earlier
// listen no longer describes where it is. Without this, restarting a track and
// leaving it within the first seconds (too early to save) brings the old
// position back on the next launch.
export function noteFreshStart(trackId: string): void {
  forgetSavedPosition(trackId);
}

// The launch track is playing from where it was resumed, so the arming is spent:
// picking that track again later starts it at 0 like any other.
export function settleResume(trackId: string): void {
  if (resumeArmedId === trackId) resumeArmedId = null;
}

// Throttled write while listening. Updates the in-memory map immediately so the
// UI/resume reflects reality even before the server write lands.
export function recordResumePosition(
  track: QueueTrack | null,
  positionSeconds: number,
  { force = false }: { force?: boolean } = {},
): void {
  if (!track) return;
  savePosition(track, positionSeconds, force);
  if (!RESUME_ENABLED) return;
  if (!bookmarksEnabled() || !isResumeEligible(track)) return;
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
  forgetSavedPosition(trackId);
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
  lastSavedAt = 0;
  lastSavedId = null;
  lastSavedPosition = 0;
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
