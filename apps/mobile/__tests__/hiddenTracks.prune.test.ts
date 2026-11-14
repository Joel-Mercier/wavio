jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => mem.set(k, v),
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => mem.delete(k),
  });
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: make(),
    createScopedStorage: () => make(),
    createDynamicScopedStorage: () => make(),
    getAuthScope: () => "scope",
  };
});

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ url: "u", username: "n" }) },
}));

jest.mock("@/services/player", () => ({ pause: jest.fn() }));

import {
  allowArtist,
  blockArtist,
  hideTrack,
  restoreToQueue,
  unhideTrack,
} from "@/services/hiddenTracks";
import { pause } from "@/services/player";
import useHiddenTracks from "@/stores/hiddenTracks";
import useQueue from "@/stores/queue";

const track = (id: string, artistId = "other") => ({
  id,
  url: `u://${id}`,
  artistId,
});

const get = () => useQueue.getState();
const ids = () => get().queue.map((t) => t.id);
const current = () => get().getCurrent()?.id;

beforeEach(() => {
  jest.clearAllMocks();
  useHiddenTracks.getState().clearAll();
  useQueue.setState({
    queue: [],
    currentIndex: null,
    removePlayed: false,
    repeatMode: "off",
    shuffle: false,
    originalOrderIds: null,
    source: null,
  });
});

describe("hiding what is in the queue", () => {
  test("moves off the hidden current track on repeat-one", () => {
    get().setQueue([track("a"), track("b"), track("c")], 0);
    get().setRepeatMode("one");
    hideTrack(track("a"));
    expect(current()).toBe("b");
    expect(ids()).toEqual(["b", "c"]);
    expect(pause).not.toHaveBeenCalled();
  });

  test("wraps past a blocked artist on repeat-all and drops its played copies", () => {
    get().setQueue([track("a1", "A"), track("b"), track("a2", "A")], 2);
    get().setRepeatMode("all");
    blockArtist({ id: "A" });
    expect(ids()).toEqual(["b"]);
    expect(current()).toBe("b");
  });

  test("pauses on the current track when nothing visible follows it", () => {
    get().setQueue([track("b"), track("a1", "A"), track("a2", "A")], 1);
    blockArtist({ id: "A" });
    expect(pause).toHaveBeenCalled();
    expect(ids()).toEqual(["b", "a1"]);
    expect(current()).toBe("a1");
  });

  test("undo puts played and upcoming copies back where they were", () => {
    get().setQueue(
      [track("a1", "A"), track("b"), track("a2", "A"), track("c")],
      2,
    );
    const removed = blockArtist({ id: "A" });
    expect(ids()).toEqual(["b", "c"]);
    expect(current()).toBe("c");
    allowArtist("A");
    restoreToQueue(removed);
    expect(ids()).toEqual(["a1", "b", "a2", "c"]);
    expect(current()).toBe("c");
  });

  test("undoing a hide of an allowed track keeps it playable", () => {
    get().setQueue([track("x"), track("y", "A"), track("z")], 0);
    blockArtist({ id: "A" });
    useHiddenTracks.getState().allowTrack("y", ["A"]);
    get().addToQueue(track("y", "A"));
    const removed = hideTrack(track("y", "A"));
    unhideTrack("y");
    restoreToQueue(removed);
    expect(ids()).toContain("y");
    expect(useHiddenTracks.getState().allowed.y?.artistKeys).toEqual(["A"]);
  });
});
