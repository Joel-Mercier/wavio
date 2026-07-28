// An AudioMuse deployment that was never told to analyse the library answers
// every search and every prompt with an empty list — the same shape a genuinely
// unmatched query produces. Telling the two apart is the only way the user
// learns that rephrasing will never help, so the rules below are the ones the
// empty state renders from.
jest.mock("@/config/storage", () => ({
  createDynamicScopedStorage: () => ({
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {},
  }),
}));

jest.mock("@/stores/auth", () => ({ currentAuthScope: () => "scope" }));

import {
  type AudioMuseIndexScope,
  selectEmptyReason,
} from "@/stores/audioMuse";

const state = (
  analyzedTrackCount: number | null,
  clapIndexedCount: number | null,
) => ({ analyzedTrackCount, clapIndexedCount });

describe("selectEmptyReason", () => {
  const scopes: AudioMuseIndexScope[] = ["analysis", "clap", "lyrics"];

  it("blames the missing scan on every surface when nothing is analysed", () => {
    for (const scope of scopes) {
      expect(selectEmptyReason(state(0, 0), scope)).toBe("notAnalyzed");
    }
  });

  it("blames the query when the catalogue is populated", () => {
    for (const scope of scopes) {
      expect(selectEmptyReason(state(1200, 900), scope)).toBeNull();
    }
  });

  // The distinction the user acts on: the library IS analysed, so a second full
  // analysis would change nothing — CLAP is a separate pass that has to be run.
  it("singles out an unbuilt sound index on an analysed library", () => {
    expect(selectEmptyReason(state(1200, 0), "clap")).toBe("clapNotIndexed");
  });

  it("does not blame the sound index on the surfaces that don't use it", () => {
    expect(selectEmptyReason(state(1200, 0), "analysis")).toBeNull();
    expect(selectEmptyReason(state(1200, 0), "lyrics")).toBeNull();
  });

  // null is "the deployment didn't say" — an older AudioMuse with no dashboard
  // blueprint reports nothing at all, and accusing it of an unscanned library
  // would send the user to re-run a scan that already ran.
  it("stays silent when the counts are unknown", () => {
    for (const scope of scopes) {
      expect(selectEmptyReason(state(null, null), scope)).toBeNull();
    }
  });

  it("still blames the scan when only the CLAP count is unknown", () => {
    expect(selectEmptyReason(state(0, null), "clap")).toBe("notAnalyzed");
  });
});
