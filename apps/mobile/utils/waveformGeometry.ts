// Bar geometry, in dp. A 3/2 split reads as distinct bars rather than a solid
// block at arm's length, and gives ~62 bars across a 312 dp phone track.
export const BAR_WIDTH = 3;
export const BAR_GAP = 2;
export const BAR_PITCH = BAR_WIDTH + BAR_GAP;

/** Height of the bar canvas (the time labels sit in their own lane below it). */
export const WAVEFORM_HEIGHT = 44;

// Round line caps extend half the stroke width past each endpoint, so the
// drawable half-height is inset by that much or the loudest bars clip.
const MAX_HALF = WAVEFORM_HEIGHT / 2 - BAR_WIDTH / 2;

// Never emit a zero-length segment: react-native-svg maps a path to
// Canvas.drawPath with a round cap on Android, which draws *nothing* for zero
// length — digital silence would look like a hole in the waveform rather than a
// quiet passage.
const MIN_HALF = 1;

// Scale bars against the 99.5th percentile rather than the maximum. A single
// clipped transient — one cymbal, one clap — would otherwise become the whole
// scale and squash every other bar to a fifth of its height.
const REFERENCE_PERCENTILE = 0.995;

// Typical mastered music sits around 0.1–0.3 of full scale in RMS, so a linear
// mapping draws almost everything as a low flat smear. The lift is what makes
// the shape read; it is the one number worth tuning by eye.
const GAMMA = 0.7;

/** Placeholder bar height, as a fraction, while peaks are still being made. */
const PLACEHOLDER_FRACTION = 0.3;

export function barCountForWidth(width: number): number {
  if (width <= 0) return 0;
  return Math.max(1, Math.floor((width + BAR_GAP) / BAR_PITCH));
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Reduce the stored envelope to one value per drawn bar, taking the **maximum**
 * of each group. Averaging flattens transients into mush; the max keeps the
 * percussive detail that makes a waveform recognisable.
 */
function downsample(peaks: Uint8Array, bars: number): number[] {
  const out = new Array<number>(bars).fill(0);
  if (peaks.length === 0 || bars === 0) return out;
  for (let b = 0; b < bars; b++) {
    const start = Math.floor((b * peaks.length) / bars);
    const end = Math.max(
      start + 1,
      Math.floor(((b + 1) * peaks.length) / bars),
    );
    let max = 0;
    for (let i = start; i < Math.min(end, peaks.length); i++) {
      if (peaks[i] > max) max = peaks[i];
    }
    out[b] = max;
  }
  return out;
}

function percentile(peaks: Uint8Array, fraction: number): number {
  if (peaks.length === 0) return 0;
  const sorted = Array.from(peaks).sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(fraction * (sorted.length - 1))),
  );
  return sorted[index];
}

/** 3-tap blur, to stop neighbouring bars alternating into a picket fence. */
function smooth(values: number[]): number[] {
  if (values.length < 3) return values;
  const out = new Array<number>(values.length);
  out[0] = values[0];
  out[values.length - 1] = values[values.length - 1];
  for (let i = 1; i < values.length - 1; i++) {
    out[i] = 0.25 * values[i - 1] + 0.5 * values[i] + 0.25 * values[i + 1];
  }
  return out;
}

/**
 * Build the SVG `d` string for a waveform.
 *
 * Every bar is one vertical subpath, centre-mirrored around the canvas midline;
 * the caller strokes the whole thing with a single round-capped `<Path>`, so an
 * entire waveform costs one SVG node rather than one per bar.
 */
export function buildWaveformPath(peaks: Uint8Array, width: number): string {
  const bars = barCountForWidth(width);
  if (bars === 0 || peaks.length === 0) return "";

  const reference = percentile(peaks, REFERENCE_PERCENTILE);
  const raw = downsample(peaks, bars);
  const shaped = smooth(
    raw.map((v) => (reference > 0 ? clamp01((v / reference) ** GAMMA) : 0)),
  );

  const centerY = WAVEFORM_HEIGHT / 2;
  const offset = barOffset(width, bars);
  const segments: string[] = [];
  for (let i = 0; i < bars; i++) {
    const half = MIN_HALF + (MAX_HALF - MIN_HALF) * shaped[i];
    const x = offset + i * BAR_PITCH + BAR_WIDTH / 2;
    segments.push(
      `M${round(x)} ${round(centerY - half)}V${round(centerY + half)}`,
    );
  }
  return segments.join("");
}

/** A flat, quiet waveform to occupy the layout until real peaks arrive. */
export function buildPlaceholderPath(width: number): string {
  const bars = barCountForWidth(width);
  if (bars === 0) return "";
  const half = MIN_HALF + (MAX_HALF - MIN_HALF) * PLACEHOLDER_FRACTION;
  const centerY = WAVEFORM_HEIGHT / 2;
  const offset = barOffset(width, bars);
  const segments: string[] = [];
  for (let i = 0; i < bars; i++) {
    const x = offset + i * BAR_PITCH + BAR_WIDTH / 2;
    segments.push(
      `M${round(x)} ${round(centerY - half)}V${round(centerY + half)}`,
    );
  }
  return segments.join("");
}

// Centre the bar run in whatever width is left over after the last whole pitch,
// so the waveform isn't visibly flush left with a gap on the right.
function barOffset(width: number, bars: number): number {
  const span = (bars - 1) * BAR_PITCH + BAR_WIDTH;
  return Math.max(0, (width - span) / 2);
}

const round = (v: number): number => Math.round(v * 10) / 10;
