import { Directory, File, Paths } from "expo-file-system";
import { analysisUrl } from "@/services/backend/streaming";
import { parseLocalTrackId } from "@/services/local/keys";
import { getConnectionType } from "@/services/network";
import { requestHeadersForUrl } from "@/services/serverHeaders";
import { useAuthBase } from "@/stores/auth";
import useOffline from "@/stores/offline";
import type { QueueTrack } from "@/stores/queue";

// A server is free to ignore `format=` and hand back the original file, which
// for a lossless library means tens of megabytes for a 1 KB result. Bail rather
// than let a misconfigured server quietly burn a connection.
//
// The budget scales with the track's length, because a flat ceiling can't tell
// "the server ignored the transcode" from "this song is nine minutes long" — it
// just refuses every long track on a non-transcoding server. Judging bytes *per
// second of audio* is the same test the flat number was reaching for. Set a
// little above 320 kbps (40 KB/s), the highest lossy bitrate in normal use, so
// an untranscoded mp3/aac/ogg original still gets analyzed while a lossless one
// — 5-10x larger, and the case this guard exists for — does not.
const MAX_ANALYSIS_BYTES_PER_SECOND = 40 * 1024;

// Floor, for a short track where container and artwork overhead is a real share
// of the file, and for one whose metadata carried no duration to scale by.
const MIN_ANALYSIS_BYTES = 8 * 1024 * 1024;

// Absolute ceiling, independent of a duration that might be nonsense.
const MAX_ANALYSIS_BYTES = 48 * 1024 * 1024;

// Below this, a "download" is much more likely to be a JSON/HTML error page
// saved under an audio extension than real audio (same guard as
// services/offline/downloadService.ts).
const SUSPICIOUS_BYTES = 4 * 1024;

export type AnalysisSource = {
  uri: string;
  /** Only set for a fetched copy — the caller deletes it after decoding. */
  temporary: boolean;
  /**
   * Identifies the *bytes* behind a stable id, for the one case where they can
   * change: a local-library file replaced in place. Null for everything else,
   * where the id already implies the content.
   */
  fingerprint: string | null;
};

/**
 * Why a track can't be analyzed, for the caller to act on. Only `"unsupported"`
 * is a property of the track itself — the other two describe the moment, and
 * must not be cached as the track's verdict.
 */
export type AnalysisRefusal = "unsupported" | "metered" | "unavailable";

const analysisDir = (): Directory => new Directory(Paths.cache, "waveform");

/**
 * Resolve something the native decoder can read for `track`.
 *
 * Downloaded and on-device tracks are already files, so they cost nothing. A
 * streamed track has to be fetched, which is why that branch is restricted to an
 * unmetered connection — the waveform is a visual nicety and not worth a
 * surprise on someone's data plan.
 */
export async function resolveAnalysisSource(
  track: QueueTrack,
): Promise<AnalysisSource | AnalysisRefusal> {
  const downloaded = useOffline.getState().getDownloadedTrack(track.id);
  if (downloaded?.path) {
    return { uri: downloaded.path, temporary: false, fingerprint: null };
  }

  const localUri = parseLocalTrackId(track.id);
  if (localUri != null) {
    return {
      uri: localUri,
      temporary: false,
      fingerprint: analysisFingerprint(track.id),
    };
  }

  // No active server yet — a sign-out or scope switch racing the settle delay.
  // Transient, so the caller retries rather than writing the track off.
  if (!useAuthBase.getState().url) return "unavailable";

  const remote = analysisUrl(track.id);
  if (!remote) return "unsupported";
  // Only cellular actually costs the user money; vpn, ethernet and the
  // pre-NetInfo "unknown" are all fine to fetch over. Same test as the bitrate
  // gate in services/network.ts.
  if (getConnectionType() === "cellular") return "metered";

  const uri = await downloadAnalysisCopy(
    track.id,
    remote.url,
    remote.suffix,
    analysisByteBudget(track.duration),
  );
  return { uri, temporary: true, fingerprint: null };
}

/** How many bytes are worth pulling to analyze a track this long. */
function analysisByteBudget(durationSeconds: number | undefined): number {
  if (!durationSeconds || durationSeconds <= 0) return MIN_ANALYSIS_BYTES;
  return Math.min(
    MAX_ANALYSIS_BYTES,
    Math.max(
      MIN_ANALYSIS_BYTES,
      Math.round(durationSeconds * MAX_ANALYSIS_BYTES_PER_SECOND),
    ),
  );
}

/**
 * A local file's identity beyond its path, cheap enough to call before a cache
 * lookup. `parseLocalTrackId` derives the id from the URI alone, so a file
 * swapped in place keeps its id — size and mtime are what catch that.
 *
 * Null for every other kind of track, where the id already implies the content
 * and the cache validates on version alone.
 */
export function analysisFingerprint(trackId: string): string | null {
  const uri = parseLocalTrackId(trackId);
  if (uri == null) return null;
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    return `${file.size ?? 0}:${file.modificationTime ?? 0}`;
  } catch {
    // A `content://` SAF URI may not answer these; the id alone is then the
    // best available identity, which is what a null fingerprint means.
    return null;
  }
}

// Deliberately no size pre-check. A HEAD against Navidrome's /rest/stream runs
// the whole ffmpeg transcode to answer, and still returns no Content-Length
// (the transcoded body is chunked), so it doubles the server's work and learns
// nothing — verified against a debug-level instance. The only server a
// Content-Length would come from is one serving a static original, which is
// exactly what the budget below catches; being one download late is the cheaper
// trade.
async function downloadAnalysisCopy(
  id: string,
  url: string,
  suffix: string,
  budget: number,
): Promise<string> {
  const dir = analysisDir();
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });

  // The extension is load-bearing on iOS: AVURLAsset infers a file's container
  // from its name, so a generic ".tmp" fails to open there and only there.
  const target = new File(dir, `${sanitize(id)}.${suffix}`);
  if (target.exists) {
    try {
      target.delete();
    } catch {
      // A stale copy from an interrupted run; the download overwrites it.
    }
  }

  const result = await File.downloadFileAsync(url, target, {
    idempotent: true,
    headers: requestHeadersForUrl(url),
  });
  if (!result.exists) {
    throw new Error("waveform: analysis download produced no file");
  }

  const size = result.size ?? 0;
  if (size > budget) {
    safeDelete(result);
    throw new Error(
      `waveform: analysis copy too large (${size} bytes, budget ${budget})`,
    );
  }
  if (size < SUSPICIOUS_BYTES) {
    const head = (await result.text()).trimStart();
    if (head.startsWith("{") || head.startsWith("<")) {
      safeDelete(result);
      throw new Error("waveform: server returned an error response");
    }
  }
  return result.uri;
}

export function releaseAnalysisSource(source: AnalysisSource): void {
  if (!source.temporary) return;
  try {
    const file = new File(source.uri);
    if (file.exists) file.delete();
  } catch {
    // Left behind in the OS cache directory, which the system reclaims.
  }
}

/** Drop any analysis copies orphaned by a crash or a kill mid-decode. */
export function clearAnalysisScratch(): void {
  try {
    const dir = analysisDir();
    if (dir.exists) dir.delete();
  } catch {
    // Best effort; these live in the cache directory.
  }
}

function safeDelete(file: File): void {
  try {
    file.delete();
  } catch {}
}

// Track ids are opaque (Subsonic ids, Jellyfin GUIDs, hex-encoded local URIs),
// so keep only what is safe in a filename.
const sanitize = (id: string): string => id.replace(/[^a-zA-Z0-9_-]/g, "_");
