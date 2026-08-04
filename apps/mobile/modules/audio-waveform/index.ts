import { requireOptionalNativeModule } from "expo";

/**
 * A track's amplitude envelope, ready to draw.
 *
 * `peaks` holds one 0..255 value per bucket — an RMS window scaled against the
 * track's own loudest window, so it describes shape rather than absolute level.
 * Per-bar contrast shaping lives in `utils/waveformGeometry.ts`.
 */
export type WaveformPeaks = {
  peaks: number[];
  /**
   * Duration measured from the decoded frame count, which is exact — unlike a
   * VBR container header. Callers should still map bars to time using the
   * player's duration and treat a large disagreement as a truncated file.
   */
  durationMs: number;
};

type AudioWaveformNativeModule = {
  extractPeaks(
    uri: string,
    buckets: number,
    maxDurationMs: number,
  ): Promise<WaveformPeaks>;
};

// Autolinked from `modules/audio-waveform` (registered as `AudioWaveform` via
// the Expo Modules API on both Android and iOS). Optional so importing this
// file never throws before a native rebuild / on web.
const Native =
  requireOptionalNativeModule<AudioWaveformNativeModule>("AudioWaveform");

/** Whether the native module is linked in the current binary. */
export const isAudioWaveformAvailable = (): boolean => Native != null;

/**
 * Error codes thrown by `extractPeaks`, split by whether a retry could ever
 * succeed. A permanent failure is cached so the track is never decoded again;
 * a transient one is retried after a back-off.
 */
export const PERMANENT_WAVEFORM_ERRORS = [
  "ERR_WAVEFORM_UNSUPPORTED",
  "ERR_WAVEFORM_DECODE",
] as const;

export function isPermanentWaveformError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return (
    code != null &&
    (PERMANENT_WAVEFORM_ERRORS as readonly string[]).includes(code)
  );
}

/**
 * Decode a **local** audio file and reduce it to a normalized RMS envelope.
 *
 * Deliberately file-only: remote tracks are downloaded by JS first (see
 * `services/waveform/source.ts`) so the app's networking stack — and with it the
 * self-signed-certificate trust store and the iOS loopback proxy — stays on the
 * one path that already works, and both platforms' native code stay identical.
 *
 * Runs on a module-owned background thread and never touches the audio session,
 * so it can't disturb playback. Decoding is capped by a 30 s wall-clock deadline.
 *
 * @param uri A `file://` URI, a bare absolute path, or (Android) a `content://`
 *   URI from the local library's SAF tree.
 * @param buckets How many envelope values to return.
 * @param maxDurationMs Refuse a file whose container declares a longer duration,
 *   before any decoding happens. Callers screen on the track metadata they
 *   already hold; this is the backstop for a track whose metadata carried no
 *   duration at all, which would otherwise decode a three-hour audiobook until
 *   the wall-clock deadline. 0 disables the check.
 */
export async function extractPeaks(
  uri: string,
  buckets: number,
  maxDurationMs: number,
): Promise<WaveformPeaks> {
  if (!Native) {
    throw new Error(
      "AudioWaveform native module is unavailable. Run `expo prebuild` and a " +
        "native rebuild (it can't be loaded in Expo Go or on web).",
    );
  }
  return Native.extractPeaks(uri, buckets, maxDurationMs);
}
