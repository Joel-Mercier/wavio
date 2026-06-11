import { requireOptionalNativeModule } from "expo";
import { type RawTagData, readRawTags } from "./rawTags";

export type { ReplayGain } from "./rawTags";

/**
 * Normalized audio tag metadata extracted from a local file.
 *
 * These fields map 1:1 onto the OpenSubsonic `Child` shape (see
 * `services/openSubsonic/types.ts`) so the future local-library backend can
 * adapt them without further translation.
 *
 * The first block is "bucket A" from the feasibility plan: everything the OS
 * metadata APIs (`MediaMetadataRetriever` / `AVMetadataItem`) surface directly.
 * The trailing block is "bucket B" — richer fields the OS APIs don't expose,
 * recovered by the pure-JS raw-frame reader in `rawTags.ts` and merged in only
 * when `enrich` is requested.
 */
export type AudioMetadata = {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  composer?: string;
  genre?: string;
  year?: number;
  trackNumber?: number;
  trackTotal?: number;
  discNumber?: number;
  discTotal?: number;
  /** Track duration in milliseconds. */
  durationMs?: number;
  /** Audio bitrate in bits per second. */
  bitrate?: number;
  /** Sampling rate in Hz (Android 12+ only; absent on older devices). */
  sampleRate?: number;
  isCompilation?: boolean;
  /**
   * Base64-encoded embedded cover art bytes (no `data:` URI prefix). Present
   * only when `includeArtwork` is requested (and `artworkDir` is not) and the
   * file has embedded art.
   */
  artworkBase64?: string;
  /**
   * `file://` URI of the embedded cover art written to disk. Present instead of
   * `artworkBase64` when `artworkDir` is given. The filename is a content hash,
   * so the same picture shared across an album is stored once.
   */
  artworkPath?: string;
  /** MIME type of the written artwork (`image/jpeg` or `image/png`). */
  artworkMimeType?: string;
  // --- bucket B: raw-frame enrichment (only when `enrich` is requested) ---
  /** ReplayGain track/album gain + peak, parsed from ID3 TXXX / Vorbis tags. */
  replayGain?: RawTagData["replayGain"];
  /** Unsynced lyrics text (ID3 USLT / Vorbis LYRICS). */
  lyrics?: string;
  /** Multi-value artist list (ID3 TPE1 / Vorbis ARTIST), order preserved. */
  artists?: string[];
  /** MusicBrainz recording/track id (ID3 UFID / Vorbis MUSICBRAINZ_TRACKID). */
  musicBrainzId?: string;
  /**
   * MusicBrainz release group type(s) — ID3 `TXXX:MusicBrainz Album Type` /
   * Vorbis `RELEASETYPE`. The OS metadata APIs don't surface these, so they only
   * appear when `enrich` is requested. Album-level, but read off each track and
   * rolled up by the local indexer.
   */
  releaseTypes?: string[];
};

type AudioMetadataNativeModule = {
  getAudioMetadata(
    uri: string,
    includeArtwork: boolean,
    artworkDir: string | null,
  ): Promise<AudioMetadata>;
};

// Autolinked from `modules/audio-metadata` (registered as `AudioMetadata` via
// the Expo Modules API on both Android and iOS). Optional so importing this
// file never throws before a native rebuild / on web.
const Native =
  requireOptionalNativeModule<AudioMetadataNativeModule>("AudioMetadata");

/** Whether the native module is linked in the current binary. */
export const isAudioMetadataAvailable = (): boolean => Native != null;

/**
 * Extract tag metadata from a single local audio file.
 *
 * @param uri A `file://` URI, a bare absolute path, or (Android) a `content://`
 *   URI. The native side picks the right data-source strategy per scheme.
 * @param options.includeArtwork When true, embedded cover art is returned as
 *   base64 in `artworkBase64`. Off by default — artwork bytes are large and
 *   should not be pulled for bulk indexing. Ignored when `artworkDir` is set.
 * @param options.artworkDir A directory (path or `file://` URI) to write the
 *   embedded cover art into. When set, the picture is saved to a content-hashed
 *   file and returned as `artworkPath` (+ `artworkMimeType`) instead of inline
 *   base64 — the right mode for bulk indexing, since identical album art is
 *   deduplicated and never shuttled through JS.
 * @param options.enrich When true, also read the raw ID3v2 / FLAC tag frames in
 *   JS to recover bucket-B fields (ReplayGain, lyrics, multi-artist,
 *   MusicBrainz id) the native APIs don't surface. Adds a small partial-file
 *   read; best-effort, so a parse failure leaves the native fields intact.
 */
export async function getAudioMetadata(
  uri: string,
  options?: { includeArtwork?: boolean; artworkDir?: string; enrich?: boolean },
): Promise<AudioMetadata> {
  if (!Native) {
    throw new Error(
      "AudioMetadata native module is unavailable. Run `expo prebuild` and a " +
        "native rebuild (it can't be loaded in Expo Go or on web).",
    );
  }
  const toFile = options?.artworkDir != null;
  const base = await Native.getAudioMetadata(
    uri,
    toFile || (options?.includeArtwork ?? false),
    options?.artworkDir ?? null,
  );
  if (!options?.enrich) return base;
  // `readRawTags` swallows its own errors and returns `{}` on failure, so this
  // never regresses the native result.
  const raw = await readRawTags(uri);
  return mergeRawTags(base, raw);
}

/** Layer bucket-B raw-frame fields onto the native result without clobbering. */
function mergeRawTags(base: AudioMetadata, raw: RawTagData): AudioMetadata {
  const merged: AudioMetadata = { ...base };
  if (raw.replayGain) merged.replayGain = raw.replayGain;
  if (raw.lyrics) merged.lyrics = raw.lyrics;
  if (raw.artists?.length) merged.artists = raw.artists;
  if (raw.musicBrainzId) merged.musicBrainzId = raw.musicBrainzId;
  if (raw.releaseTypes?.length) merged.releaseTypes = raw.releaseTypes;
  // The native APIs don't expose release types, so raw is authoritative there.
  // For year they do, so only fall back to the raw frame when native found none.
  if (merged.year == null && raw.year != null) merged.year = raw.year;
  return merged;
}
