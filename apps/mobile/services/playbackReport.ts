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
let lastPositionMs = 0;
let lastSentState: PlaybackReportState | null = null;
let lastProgressSentAt = 0;
let trackStartedAt = 0;

export function playbackReportEnabled(): boolean {
  return useServerExtensionsBase.getState().hasExtension("playbackReport");
}

function send(id: string, state: PlaybackReportState, positionMs: number) {
  reportPlayback({
    mediaId: id,
    state,
    positionMs: Math.max(0, Math.round(positionMs)),
    playbackRate: 1,
  }).catch(() => {});
}

export function reportStarting(id: string) {
  currentId = id;
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

export function reportStopped() {
  if (!currentId) return;
  send(currentId, "stopped", lastPositionMs);
  currentId = null;
  lastSentState = null;
  lastPositionMs = 0;
}
