import type { Child } from "@/services/openSubsonic/types";
import { orderPlaylistEntries, playlistTracks } from "@/utils/playlistOrder";

const track = (id: string, tag: string): Child => ({ id, title: tag }) as Child;

describe("orderPlaylistEntries", () => {
  it("returns a copy of entries when there is no stored order", () => {
    const entries = [track("a", "a"), track("b", "b")];
    const result = orderPlaylistEntries(entries, undefined);
    expect(result).toEqual(entries);
    expect(result).not.toBe(entries);
  });

  it("reorders entries to match the stored order", () => {
    const entries = [track("a", "a"), track("b", "b"), track("c", "c")];
    const result = orderPlaylistEntries(entries, ["c", "a", "b"]);
    expect(result.map((e) => e.id)).toEqual(["c", "a", "b"]);
  });

  it("keeps duplicate ids in distinct slots", () => {
    const a1 = track("a", "first");
    const a2 = track("a", "second");
    const b = track("b", "b");
    // server order: a1, b, a2 — stored order interleaves the two copies of "a"
    const result = orderPlaylistEntries([a1, b, a2], ["a", "a", "b"]);
    expect(result).toEqual([a1, a2, b]);
  });

  it("appends entries added since the order was saved, in server order", () => {
    const entries = [track("a", "a"), track("b", "b"), track("c", "c")];
    const result = orderPlaylistEntries(entries, ["c", "a"]);
    expect(result.map((e) => e.id)).toEqual(["c", "a", "b"]);
  });

  it("ignores stored ids that are no longer present", () => {
    const entries = [track("a", "a"), track("b", "b")];
    const result = orderPlaylistEntries(entries, ["x", "b", "a"]);
    expect(result.map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("playlistTracks", () => {
  const entries = [
    { id: "a", title: "Aaa", album: "Z", year: 1990 },
    { id: "b", title: "Bbb", album: "Y", year: 2000 },
    { id: "c", title: "Ccc", album: "X" },
  ] as Child[];
  const manual = ["c", "b", "a"];

  it("is the manual order for addedAtAsc", () => {
    expect(
      playlistTracks(entries, manual, "addedAtAsc").map((e) => e.id),
    ).toEqual(["c", "b", "a"]);
  });

  it("reverses the manual order — not the server order — for addedAtDesc", () => {
    expect(
      playlistTracks(entries, manual, "addedAtDesc").map((e) => e.id),
    ).toEqual(["a", "b", "c"]);
  });

  it("applies a field sort on top of the manual order", () => {
    expect(
      playlistTracks(entries, manual, "albumAsc").map((e) => e.id),
    ).toEqual(["c", "b", "a"]);
    // Entries with no year go last, and the rest keep the manual order on ties.
    expect(playlistTracks(entries, manual, "yearAsc").map((e) => e.id)).toEqual(
      ["a", "b", "c"],
    );
  });

  it("tolerates missing entries", () => {
    expect(playlistTracks(undefined, undefined, "addedAtAsc")).toEqual([]);
  });
});
