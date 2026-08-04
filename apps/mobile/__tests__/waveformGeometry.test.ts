import {
  BAR_GAP,
  BAR_PITCH,
  BAR_WIDTH,
  barCountForWidth,
  buildPlaceholderPath,
  buildWaveformPath,
  WAVEFORM_HEIGHT,
} from "@/utils/waveformGeometry";

// Each bar is one `M x y V y2` subpath, so counting them and reading their
// endpoints back is enough to assert the whole shaping pipeline.
type Bar = { x: number; top: number; bottom: number };

function parseBars(d: string): Bar[] {
  const bars: Bar[] = [];
  const re = /M(-?[\d.]+) (-?[\d.]+)V(-?[\d.]+)/g;
  let match = re.exec(d);
  while (match) {
    bars.push({
      x: Number(match[1]),
      top: Number(match[2]),
      bottom: Number(match[3]),
    });
    match = re.exec(d);
  }
  return bars;
}

const halfHeights = (d: string): number[] =>
  parseBars(d).map((b) => (b.bottom - b.top) / 2);

const peaksOf = (values: number[]): Uint8Array => Uint8Array.from(values);

describe("barCountForWidth", () => {
  it("fits as many whole bars as the width allows", () => {
    // The last bar needs no trailing gap, hence the +BAR_GAP.
    expect(barCountForWidth(BAR_WIDTH)).toBe(1);
    expect(barCountForWidth(BAR_WIDTH + BAR_PITCH)).toBe(2);
    expect(barCountForWidth(312)).toBe(Math.floor((312 + BAR_GAP) / BAR_PITCH));
  });

  it("returns nothing for an unmeasured width", () => {
    expect(barCountForWidth(0)).toBe(0);
    expect(barCountForWidth(-10)).toBe(0);
  });
});

describe("buildWaveformPath", () => {
  it("draws one bar per available slot", () => {
    const peaks = peaksOf(Array.from({ length: 1024 }, (_, i) => i % 256));
    const bars = parseBars(buildWaveformPath(peaks, 312));
    expect(bars).toHaveLength(barCountForWidth(312));
  });

  it("keeps every bar inside the canvas", () => {
    const peaks = peaksOf(new Array(1024).fill(255));
    for (const bar of parseBars(buildWaveformPath(peaks, 312))) {
      expect(bar.top).toBeGreaterThanOrEqual(0);
      expect(bar.bottom).toBeLessThanOrEqual(WAVEFORM_HEIGHT);
    }
  });

  it("centres bars on the canvas midline", () => {
    const peaks = peaksOf(
      Array.from({ length: 1024 }, (_, i) => (i * 7) % 256),
    );
    for (const bar of parseBars(buildWaveformPath(peaks, 312))) {
      expect((bar.top + bar.bottom) / 2).toBeCloseTo(WAVEFORM_HEIGHT / 2, 1);
    }
  });

  it("renders a constant signal as bars of equal height", () => {
    const peaks = peaksOf(new Array(1024).fill(120));
    const heights = halfHeights(buildWaveformPath(peaks, 312));
    for (const h of heights) expect(h).toBeCloseTo(heights[0], 5);
  });

  it("gives silence a visible minimum rather than a zero-length segment", () => {
    // A zero-length round-capped subpath draws nothing at all on Android, which
    // would read as a hole in the waveform instead of a quiet passage.
    const peaks = peaksOf(new Array(1024).fill(0));
    for (const h of halfHeights(buildWaveformPath(peaks, 312))) {
      expect(h).toBeGreaterThan(0);
    }
  });

  it("ignores a lone clipped transient when setting the scale", () => {
    // One sample at full scale among quiet ones must not squash everything
    // else — that is the whole point of scaling to a percentile, not the max.
    const quiet = new Array(1024).fill(60);
    const spiked = [...quiet];
    spiked[500] = 255;

    const withoutSpike = halfHeights(buildWaveformPath(peaksOf(quiet), 312));
    const withSpike = halfHeights(buildWaveformPath(peaksOf(spiked), 312));

    // Compare a bar far from the spike; it should be essentially unchanged.
    expect(withSpike[10]).toBeCloseTo(withoutSpike[10], 1);
  });

  it("draws louder passages taller than quieter ones", () => {
    const values = new Array(1024).fill(40);
    for (let i = 512; i < 1024; i++) values[i] = 200;
    const heights = halfHeights(buildWaveformPath(peaksOf(values), 312));
    const quiet = heights[5];
    const loud = heights[heights.length - 5];
    expect(loud).toBeGreaterThan(quiet);
  });

  it("returns nothing when there is no width or no data", () => {
    expect(buildWaveformPath(peaksOf(new Array(1024).fill(128)), 0)).toBe("");
    expect(buildWaveformPath(peaksOf([]), 312)).toBe("");
  });
});

describe("buildPlaceholderPath", () => {
  it("matches the real waveform's bar count so nothing shifts on load", () => {
    const peaks = peaksOf(Array.from({ length: 1024 }, (_, i) => i % 256));
    expect(parseBars(buildPlaceholderPath(312))).toHaveLength(
      parseBars(buildWaveformPath(peaks, 312)).length,
    );
  });

  it("draws a flat row of visible bars", () => {
    const heights = halfHeights(buildPlaceholderPath(312));
    expect(heights.length).toBeGreaterThan(0);
    for (const h of heights) {
      expect(h).toBeGreaterThan(0);
      expect(h).toBeCloseTo(heights[0], 5);
    }
  });
});
