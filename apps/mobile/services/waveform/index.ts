import { AppState, type AppStateStatus } from "react-native";
import { subscribePlaybackState } from "@/hooks/player/playbackSnapshot";
import {
  extractPeaks,
  isAudioWaveformAvailable,
  isPermanentWaveformError,
} from "@/modules/audio-waveform";
import { reportError } from "@/services/errorReporting";
import {
  type CachedWaveform,
  pruneWaveforms,
  readWaveform,
  WAVEFORM_BUCKETS,
  writeWaveform,
  writeWaveformFailure,
} from "@/services/waveform/cache";
import {
  type AnalysisSource,
  analysisFingerprint,
  clearAnalysisScratch,
  releaseAnalysisSource,
  resolveAnalysisSource,
} from "@/services/waveform/source";
import { useAppBase } from "@/stores/app";
import { useAuthBase } from "@/stores/auth";
import useQueue, { type QueueTrack } from "@/stores/queue";

// Long-form audio is both expensive to fetch and pointless to draw: at this
// length one bar already spans several seconds. Podcasts and radio are excluded
// outright below for the same reason.
const MAX_ANALYZABLE_SECONDS = 15 * 60;

// Decoding while ExoPlayer is still filling its initial buffer is when audio
// underruns are audible and the device's codec pool is most contended. Let
// playback settle first — the waveform is never urgent.
const SETTLE_DELAY_MS = 1200;

export type WaveformStatus = "idle" | "loading" | "ready" | "unavailable";

export type WaveformEntry = {
  status: WaveformStatus;
  peaks: Uint8Array | null;
  durationMs: number;
};

const IDLE: WaveformEntry = { status: "idle", peaks: null, durationMs: 0 };
const UNAVAILABLE: WaveformEntry = {
  status: "unavailable",
  peaks: null,
  durationMs: 0,
};

// Bounded in-memory tier in front of SQLite: re-opening the player for a track
// played a minute ago shouldn't hit the database, but a long shuffle session
// shouldn't grow without limit either. A Map preserves insertion order, so the
// oldest key is the first one.
const MEMORY_LIMIT = 60;
const entries = new Map<string, WaveformEntry>();

const listeners = new Set<() => void>();
// Ref-counted demand: a track is only worth work while something is displaying
// it. This is what stops a rapid skip through ten tracks from decoding ten.
const demand = new Map<string, number>();

let queue: string[] = [];
let running = false;
let generation = 0;
let settleTimer: ReturnType<typeof setTimeout> | null = null;

function notify(): void {
  for (const l of listeners) l();
}

function setEntry(id: string, entry: WaveformEntry): void {
  entries.delete(id);
  entries.set(id, entry);
  while (entries.size > MEMORY_LIMIT) {
    const oldest = entries.keys().next().value;
    if (oldest == null) break;
    entries.delete(oldest);
  }
  notify();
}

export function getWaveformEntry(id: string | null | undefined): WaveformEntry {
  if (!id) return IDLE;
  return entries.get(id) ?? IDLE;
}

export function subscribeWaveforms(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Whether a waveform could ever exist for this track. */
export function isAnalyzable(track: QueueTrack | null | undefined): boolean {
  if (!track?.id) return false;
  if (track.isRadio) return false;
  if (track.source === "podcast") return false;
  const duration = typeof track.duration === "number" ? track.duration : 0;
  if (duration > MAX_ANALYZABLE_SECONDS) return false;
  return true;
}

/**
 * Register interest in a track's waveform and start work if it isn't cached.
 * The returned function drops the interest — an in-flight decode for a track
 * nobody is showing any more is abandoned rather than stored.
 */
export function requestWaveform(track: QueueTrack): () => void {
  const id = track.id;
  demand.set(id, (demand.get(id) ?? 0) + 1);
  void ensure(track);
  return () => {
    const next = (demand.get(id) ?? 1) - 1;
    if (next <= 0) demand.delete(id);
    else demand.set(id, next);
  };
}

async function ensure(track: QueueTrack): Promise<void> {
  const id = track.id;
  if (
    !isAudioWaveformAvailable() ||
    !useAppBase.getState().waveformSeekbarEnabled
  ) {
    if (entries.get(id)?.status !== "unavailable") setEntry(id, UNAVAILABLE);
    return;
  }
  if (!isAnalyzable(track)) {
    setEntry(id, UNAVAILABLE);
    return;
  }
  const existing = entries.get(id);
  if (existing && existing.status !== "idle") return;

  setEntry(id, { status: "loading", peaks: null, durationMs: 0 });

  const cached = await readWaveform(id, analysisFingerprint(id));
  if (cached === "skip") {
    setEntry(id, UNAVAILABLE);
    return;
  }
  if (cached !== "pending") {
    applyCached(id, cached);
    return;
  }
  if (!queue.includes(id)) queue.push(id);
  scheduleDrain();
}

function applyCached(id: string, cached: CachedWaveform): void {
  setEntry(id, {
    status: "ready",
    peaks: cached.peaks,
    durationMs: cached.durationMs,
  });
}

function scheduleDrain(): void {
  if (running || queue.length === 0) return;
  if (AppState.currentState !== "active") return;
  if (settleTimer) return;
  settleTimer = setTimeout(() => {
    settleTimer = null;
    void drain();
  }, SETTLE_DELAY_MS);
}

// Strictly serial. Two concurrent decoders plus the one ExoPlayer holds for
// playback is exactly the combination that exhausts a device's codec pool.
async function drain(): Promise<void> {
  if (running) return;
  running = true;
  const startGeneration = generation;
  try {
    while (queue.length > 0) {
      if (generation !== startGeneration) return;
      if (AppState.currentState !== "active") return;
      const id = queue.shift();
      if (!id) continue;
      // Skipped past while queued: whoever wanted it is gone.
      if (!demand.has(id)) {
        if (entries.get(id)?.status === "loading") entries.delete(id);
        continue;
      }
      await decode(id, startGeneration);
    }
    void pruneWaveforms();
  } finally {
    running = false;
    // A cancelled decode can keep `running` true long after the work was
    // abandoned, and scheduleDrain no-ops while it is. Anything enqueued in that
    // window would sit there until an unrelated event happened to drain it.
    if (queue.length > 0) scheduleDrain();
  }
}

async function decode(id: string, startGeneration: number): Promise<void> {
  const track = findTrack(id);
  if (!track) {
    entries.delete(id);
    return;
  }

  let source: AnalysisSource | null = null;
  try {
    const resolved = await resolveAnalysisSource(track);
    if (resolved === "unsupported") {
      await writeWaveformFailure(id, null, true);
      setEntry(id, UNAVAILABLE);
      return;
    }
    if (resolved === "metered" || resolved === "unavailable") {
      // Not a failure: off cellular, or once a server is active again, the same
      // track analyzes normally. Nothing is written to the cache and the entry
      // resets to idle so a later request re-attempts it.
      entries.delete(id);
      notify();
      return;
    }
    source = resolved;

    // The same cap isAnalyzable applies, re-checked against the file's own
    // container: a track whose metadata carried no duration passes that screen.
    const result = await extractPeaks(
      source.uri,
      WAVEFORM_BUCKETS,
      MAX_ANALYZABLE_SECONDS * 1000,
    );
    const peaks = Uint8Array.from(result.peaks);

    if (generation !== startGeneration) return;
    await writeWaveform(id, peaks, result.durationMs, source.fingerprint);
    if (demand.has(id)) {
      setEntry(id, {
        status: "ready",
        peaks,
        durationMs: result.durationMs,
      });
    } else {
      entries.delete(id);
    }
  } catch (error) {
    // Cancelling deletes the scratch file out from under the native reader, so
    // an error raised after that describes our own teardown, not the track.
    // Caching it would blackhole a perfectly decodable file for good.
    if (generation !== startGeneration) {
      entries.delete(id);
      return;
    }
    const permanent = isPermanentWaveformError(error);
    await writeWaveformFailure(id, source?.fingerprint ?? null, permanent);
    setEntry(id, UNAVAILABLE);
    // Otherwise a track that silently shows a flat placeholder gives no way to
    // tell an oversized download from an undecodable codec: a permanent failure
    // never reaches Sentry by design, and a transient one only reaches Sentry.
    if (__DEV__) {
      console.warn(`[waveform] ${id} failed (permanent=${permanent}):`, error);
    }
    // A permanent failure is an ordinary property of someone's library (an
    // exotic codec), not a bug worth an alert.
    if (!permanent) {
      reportError(error, {
        area: "player",
        endpoint: "waveform/extractPeaks",
        extra: { trackId: id },
      });
    }
  } finally {
    if (source) releaseAnalysisSource(source);
  }
}

function findTrack(id: string): QueueTrack | null {
  return useQueue.getState().queue.find((t) => t.id === id) ?? null;
}

/** Abandon queued work — on backgrounding, or when the setting is turned off. */
export function cancelWaveformWork(): void {
  generation++;
  queue = [];
  if (settleTimer) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
  for (const [id, entry] of entries) {
    if (entry.status === "loading") entries.delete(id);
  }
  notify();
}

/**
 * Re-request whatever is still on screen after work was abandoned. The player
 * stays mounted across a background/foreground cycle, so `requestWaveform` never
 * fires again on its own and the current track would show a placeholder until it
 * changed. Tracks that already resolved are left alone.
 */
function resumeDemand(): void {
  for (const id of demand.keys()) {
    if (entries.has(id)) continue;
    const track = findTrack(id);
    if (track) void ensure(track);
  }
}

export function clearWaveformMemory(): void {
  cancelWaveformWork();
  entries.clear();
  notify();
}

// Decoding in the background wastes battery for a UI nobody can see — and on
// iOS an in-flight reader stalls anyway and fails with a confusing error. The
// audio background mode and Android's foreground service both keep this process
// alive, so nothing stops it unless we do.
AppState.addEventListener("change", (state: AppStateStatus) => {
  if (state === "active") {
    resumeDemand();
    scheduleDrain();
    return;
  }
  cancelWaveformWork();
  clearAnalysisScratch();
});

// Playback starting is the signal that the codec pool and the network have
// settled enough to decode; the delay in scheduleDrain adds the rest.
subscribePlaybackState(() => {
  scheduleDrain();
});

// Turning the setting off marks every requested track "unavailable", which would
// otherwise stick and stop those tracks generating when it's turned back on.
useAppBase.subscribe((state, prev) => {
  if (state.waveformSeekbarEnabled !== prev.waveformSeekbarEnabled) {
    clearWaveformMemory();
  }
});

// Cached peaks are keyed by the active backend's track id, which two servers can
// reuse for different audio — and the SQLite file they came from is swapped on a
// scope change anyway. Drop the in-memory tier with it.
useAuthBase.subscribe((state, prev) => {
  if (state.url !== prev.url || state.username !== prev.username) {
    clearWaveformMemory();
    clearAnalysisScratch();
  }
});
