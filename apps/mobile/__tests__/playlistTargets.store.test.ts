import usePlaylistTargets from "@/stores/playlistTargets";

const get = () => usePlaylistTargets.getState();
const target = (id: string) => ({ id, name: `Playlist ${id}` });

describe("playlistTargets store", () => {
  beforeEach(() => {
    get().__reset();
  });

  it("records targets most-recent-first", () => {
    get().recordTargets([target("a")]);
    get().recordTargets([target("b")]);
    expect(get().recentTargets.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("moves an already-known target back to the front instead of duplicating", () => {
    get().recordTargets([target("a")]);
    get().recordTargets([target("b")]);
    get().recordTargets([target("a")]);
    expect(get().recentTargets.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("keeps the order of a multi-playlist add", () => {
    get().recordTargets([target("a"), target("b")]);
    expect(get().recentTargets.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("caps the list at five", () => {
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      get().recordTargets([target(id)]);
    }
    expect(get().recentTargets.map((t) => t.id)).toEqual([
      "f",
      "e",
      "d",
      "c",
      "b",
    ]);
  });

  it("forget drops a single target", () => {
    get().recordTargets([target("a"), target("b")]);
    get().forget("a");
    expect(get().recentTargets.map((t) => t.id)).toEqual(["b"]);
  });

  it("ignores an empty record", () => {
    get().recordTargets([target("a")]);
    get().recordTargets([]);
    expect(get().recentTargets.map((t) => t.id)).toEqual(["a"]);
  });
});
