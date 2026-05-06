import type { QueueTrack } from "@/stores/queue";

export type ReplayGainMode = "off" | "track" | "album";

type ReplayGainTags = {
  trackGain?: number;
  albumGain?: number;
  trackPeak?: number;
  albumPeak?: number;
  baseGain?: number;
  fallbackGain?: number;
};

const dbToLinear = (db: number) => 10 ** (db / 20);

export function computeReplayGainFactor(
  track: QueueTrack,
  mode: ReplayGainMode,
  preampDb: number,
): number {
  if (mode === "off") return 1;

  const rg = track.replayGain as ReplayGainTags | undefined;
  if (!rg) return Math.min(1, dbToLinear(preampDb));

  const gainDb =
    (mode === "album" ? rg.albumGain : rg.trackGain) ?? rg.fallbackGain ?? 0;
  const peak = (mode === "album" ? rg.albumPeak : rg.trackPeak) ?? 1;
  // Some servers pre-apply baseGain to the streamed audio. Subtract it so we
  // don't double-apply.
  const base = rg.baseGain ?? 0;

  let factor = dbToLinear(gainDb + preampDb - base);
  if (peak > 0) factor = Math.min(factor, 1 / peak);
  // expo-audio volume is bounded to [0, 1] so positive net gain is clipped.
  return Math.min(1, Math.max(0, factor));
}
