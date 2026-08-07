import {
  type PlaybackReportState,
  reportPlayback,
} from "@/services/backend/mediaAnnotation";
import { useServerExtensionsBase } from "@/stores/serverExtensions";

// Client side of the OpenSubsonic `playbackReport` extension (Navidrome
// v0.62.0). When the active server advertises it, the player drives this module
// through the playback lifecycle (starting → playing/paused → stopped) and the
// server takes over scrobbling and getNowPlaying enrichment. On servers without
// the extension, reportStarting() is never called (player.ts gates that on
// playbackReportEnabled()), so every other function here no-ops via the
// `currentId` guard and the player keeps using the classic scrobble flow.

// How often to push a "playing" progress report while a track plays. The server
// estimates position between reports, so this only needs to be frequent enough
// to stay accurate; Navidrome's UIPlaybackReportInterval defaults to 1m.
const PROGRESS_REPORT_INTERVAL_MS = 30_000;

// Right after a track change the audio source swap can emit one stale status
// tick carrying the *previous* track's position. Ignore progress for a short
// window after "starting" so that bogus value never gets reported; the "starting"
// report already created the now-playing entry, and resume-from-bookmark stays
// correct because the first real report after the window carries the true
// position rather than the (always-0) "starting" position.
const STARTUP_GRACE_MS = 1_500;

let currentId: string | null = null;
// The rate the current track is playing at. The server extrapolates position
// between the ~30s progress reports, so a podcast at 1.5× would drift half a
// minute ahead of the server's estimate if this always claimed 1.
let currentRate = 1;
let lastPositionMs = 0;
let lastSentState: PlaybackReportState | null = null;
let lastProgressSentAt = 0;
let trackStartedAt = 0;

export function playbackReportEnabled(): boolean {
  return useServerExtensionsBase.getState().hasExtension("playbackReport");
}

function send(
  id: string,
  state: PlaybackReportState,
  positionMs: number,
  ignoreScrobble?: boolean,
) {
  reportPlayback({
    mediaId: id,
    state,
    positionMs: Math.max(0, Math.round(positionMs)),
    playbackRate: currentRate,
    ignoreScrobble,
  }).catch(() => {});
}

// Re-report the speed of the track already playing, so changing it mid-episode
// corrects the server's estimate instead of waiting for the next track.
export function notePlaybackRateChanged(rate: number) {
  if (!currentId || rate === currentRate) return;
  currentRate = rate;
  send(currentId, lastSentState ?? "playing", lastPositionMs);
}

export function reportStarting(id: string, playbackRate = 1) {
  currentId = id;
  currentRate = playbackRate;
  lastPositionMs = 0;
  lastSentState = "starting";
  lastProgressSentAt = Date.now();
  trackStartedAt = Date.now();
  send(id, "starting", 0);
}

export function reportProgress(positionMs: number) {
  if (!currentId) return;
  // Drop the transient stale tick from the source swap (see STARTUP_GRACE_MS).
  if (Date.now() - trackStartedAt < STARTUP_GRACE_MS) return;
  lastPositionMs = positionMs;
  const now = Date.now();
  if (
    lastSentState === "playing" &&
    now - lastProgressSentAt < PROGRESS_REPORT_INTERVAL_MS
  ) {
    return;
  }
  lastSentState = "playing";
  lastProgressSentAt = now;
  send(currentId, "playing", positionMs);
}

export function reportPaused(positionMs: number) {
  if (!currentId) return;
  lastPositionMs = positionMs;
  if (lastSentState === "paused") return;
  lastSentState = "paused";
  send(currentId, "paused", positionMs);
}

// `ignoreScrobble` tells the server not to count this play on "stopped" — used
// when the player already counted it early via a classic scrobble (see
// services/player.ts) so the server doesn't double-count.
export function reportStopped(ignoreScrobble?: boolean) {
  if (!currentId) return;
  send(currentId, "stopped", lastPositionMs, ignoreScrobble);
  currentId = null;
  currentRate = 1;
  lastSentState = null;
  lastPositionMs = 0;
}
