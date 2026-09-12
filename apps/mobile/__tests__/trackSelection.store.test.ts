import type { Child } from "@/services/openSubsonic/types";
import useTrackSelection from "@/stores/trackSelection";

const makeTrack = (id: string): Child =>
  ({ id, title: `Track ${id}` }) as Child;

const a = makeTrack("a");
const b = makeTrack("b");
const c = makeTrack("c");

const get = () => useTrackSelection.getState();

describe("trackSelection store", () => {
  beforeEach(() => {
    get().__reset();
  });

  it("starts inactive and empty", () => {
    expect(get().active).toBe(false);
    expect(get().selected).toEqual([]);
    expect(get().selectedIds).toEqual({});
  });

  it("enter activates selection with the seed track", () => {
    get().enter(b);
    expect(get().active).toBe(true);
    expect(get().selected).toEqual([b]);
    expect(get().selectedIds).toEqual({ b: true });
  });

  // The collection sheets (album, playlist) open selection mode without a seed
  // track: the user picks the rows afterwards.
  it("enter with no track activates an empty selection", () => {
    get().enter();
    expect(get().active).toBe(true);
    expect(get().selected).toEqual([]);
    expect(get().selectedIds).toEqual({});
  });

  it("toggle adds and removes, keeping selectedIds in sync", () => {
    get().enter(a);
    get().toggle(b);
    expect(get().selected.map((track) => track.id)).toEqual(["a", "b"]);
    expect(get().selectedIds).toEqual({ a: true, b: true });

    get().toggle(a);
    expect(get().selected.map((track) => track.id)).toEqual(["b"]);
    expect(get().selectedIds).toEqual({ b: true });
  });

  it("toggle preserves selection order for the tracks that remain", () => {
    get().enter(a);
    get().toggle(b);
    get().toggle(c);
    get().toggle(b);
    expect(get().selected.map((track) => track.id)).toEqual(["a", "c"]);
  });

  it("selectAll takes the whole pool and is a no-op without one", () => {
    get().enter(a);
    get().selectAll();
    expect(get().selected).toEqual([a]);

    get().setPool([a, b, c]);
    get().selectAll();
    expect(get().selected.map((track) => track.id)).toEqual(["a", "b", "c"]);
    expect(get().selectedIds).toEqual({ a: true, b: true, c: true });
  });

  // A playlist can legitimately hold the same track twice; both of its rows
  // highlight together because isSelected is keyed by id, so the selection must
  // count that track once and hand it over once.
  it("selectAll keeps one entry per distinct track id", () => {
    get().enter(a);
    get().setPool([a, b, a, c]);
    get().selectAll();
    expect(get().selected.map((track) => track.id)).toEqual(["a", "b", "c"]);
    expect(get().selectedIds).toEqual({ a: true, b: true, c: true });
  });

  it("deselectAll empties the selection but stays in selection mode", () => {
    get().enter(a);
    get().toggle(b);
    get().deselectAll();
    expect(get().active).toBe(true);
    expect(get().selected).toEqual([]);
    expect(get().selectedIds).toEqual({});
  });

  it("exit leaves selection mode but keeps the pool", () => {
    get().setPool([a, b]);
    get().enter(a);
    get().exit();
    expect(get().active).toBe(false);
    expect(get().selected).toEqual([]);
    expect(get().selectedIds).toEqual({});
    expect(get().pool).toEqual([a, b]);
  });

  // useScreenBottomPadding reads this to reserve room for the bar; a write per
  // layout pass that changed nothing would re-render every scrollable screen.
  it("setBarHeight ignores a repeat of the same height", () => {
    get().setBarHeight(108);
    const before = useTrackSelection.getState();
    get().setBarHeight(108);
    expect(useTrackSelection.getState()).toBe(before);

    get().setBarHeight(132);
    expect(get().barHeight).toBe(132);
  });

  it("__reset clears the pool too", () => {
    get().setPool([a, b]);
    get().enter(a);
    get().__reset();
    expect(get().active).toBe(false);
    expect(get().pool).toEqual([]);
  });
});
