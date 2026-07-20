import type { ActivityEntry, ActivitySource } from "@/stores/activity";
import { groupActivity } from "@/utils/activityGrouping";

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

const s1: ActivitySource = { type: "album", id: "a1", name: "A1" };
const s2: ActivitySource = { type: "playlist", id: "p1", name: "P1" };

let seq = 0;
const entry = (
  trackId: string,
  source: ActivitySource,
  playedAt = now - seq++ * 1000,
): ActivityEntry => ({
  trackId,
  title: `Title ${trackId}`,
  source,
  playedAt,
});

beforeEach(() => {
  seq = 0;
});

describe("groupActivity", () => {
  it("groups consecutive same-source runs and starts a new group when the source is revisited", () => {
    const entries = [
      entry("a", s1),
      entry("b", s1),
      entry("c", s2),
      entry("d", null),
      entry("e", null),
      entry("f", s1),
    ];
    const [today] = groupActivity(entries);
    expect(today.key).toBe("today");
    const groups = today.groups;
    expect(groups).toHaveLength(4);
    expect(groups.map((g) => g.source?.id ?? "__generic__")).toEqual([
      "a1",
      "p1",
      "__generic__",
      "a1",
    ]);
    expect(groups[0].entries.map((e) => e.trackId)).toEqual(["a", "b"]);
    expect(groups[2].entries.map((e) => e.trackId)).toEqual(["d", "e"]);
    expect(groups[3].entries.map((e) => e.trackId)).toEqual(["f"]);
  });

  it("merges consecutive sourceless plays into a single generic group", () => {
    const entries = [entry("a", null), entry("b", null), entry("c", null)];
    const groups = groupActivity(entries)[0].groups;
    expect(groups).toHaveLength(1);
    expect(groups[0].source).toBeNull();
    expect(groups[0].entries).toHaveLength(3);
  });

  it("dedupes by trackId within a group, keeping the most recent", () => {
    const entries = [entry("x", s1), entry("y", s1), entry("x", s1)];
    const group = groupActivity(entries)[0].groups[0];
    expect(group.entries.map((e) => e.trackId)).toEqual(["x", "y"]);
  });

  it("splits plays into day buckets", () => {
    const entries = [entry("today", s1, now), entry("old", s2, now - 40 * DAY)];
    const sections = groupActivity(entries);
    expect(sections.map((s) => s.key)).toEqual(["today", "older"]);
    expect(sections[0].groups[0].entries[0].trackId).toBe("today");
    expect(sections[1].groups[0].entries[0].trackId).toBe("old");
  });
});
