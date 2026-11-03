import {
  autoDownloadKey,
  isPlaylistIncluded,
  isSmartPlaylist,
  needsCollectionFetch,
  outranks,
  planAutoDownloadRelease,
} from "@/services/offline/autoDownloadPlan";
import type { Playlist } from "@/services/openSubsonic/types";
import type {
  AutoDownloadOverride,
  OfflineCollection,
  OfflineSource,
  OfflineTrack,
  QueuedTrack,
} from "@/stores/offline";

const track = (id: string, source?: OfflineSource): OfflineTrack => ({
  id,
  title: id,
  duration: 1,
  path: `/doc/${id}.mp3`,
  size: 1,
  downloadedAt: "2026-11-01T00:00:00.000Z",
  source,
});

const collection = (
  id: string,
  kind: OfflineCollection["kind"],
  trackIds: string[],
  source?: OfflineSource,
): OfflineCollection => ({
  id,
  kind,
  name: id,
  songCount: trackIds.length,
  trackIds,
  savedAt: "2026-11-01T00:00:00.000Z",
  source,
  ruleVersion: source === "rule" ? "v1" : undefined,
});

const queued = (id: string, offlineSource?: OfflineSource): QueuedTrack => ({
  id,
  isDir: false,
  title: id,
  offlineSource,
});

const playlist = (id: string, extra: Partial<Playlist> = {}): Playlist => ({
  id,
  name: id,
  songCount: 1,
  duration: 1,
  created: new Date("2026-01-01T00:00:00.000Z"),
  changed: new Date("2026-01-01T00:00:00.000Z"),
  ...extra,
});

const byId = <T extends { id: string }>(items: T[]) =>
  Object.fromEntries(items.map((item) => [item.id, item]));

const ALL_ON = { likedSongs: true, likedAlbums: true, playlists: true };

const plan = (args: Partial<Parameters<typeof planAutoDownloadRelease>[0]>) =>
  planAutoDownloadRelease({
    collections: {},
    tracks: {},
    queue: [],
    rules: ALL_ON,
    overrides: {},
    likedSongIds: [],
    likedAlbumIds: null,
    playlistIds: null,
    ...args,
  });

describe("outranks", () => {
  it("ranks a hand save over an automatic download over the library sync", () => {
    expect(outranks("rule", "auto")).toBe(true);
    expect(outranks("user", "rule")).toBe(true);
    expect(outranks("rule", "user")).toBe(false);
    expect(outranks("auto", "rule")).toBe(false);
    expect(outranks("rule", "rule")).toBe(false);
  });

  it("treats content without a source as a hand save", () => {
    expect(outranks("rule", undefined)).toBe(false);
  });
});

describe("playlist selection", () => {
  it("leaves smart playlists out unless the user opts one in", () => {
    const smart = playlist("s", { validUntil: "2026-11-02T00:00:00Z" });
    const regular = playlist("r");
    const overrides: Record<string, AutoDownloadOverride> = {};

    expect(isSmartPlaylist(smart, new Set())).toBe(true);
    expect(isSmartPlaylist(regular, new Set(["r"]))).toBe(true);
    expect(isPlaylistIncluded(overrides, smart, true)).toBe(false);
    expect(isPlaylistIncluded(overrides, regular, false)).toBe(true);

    overrides[autoDownloadKey("playlist", "s")] = {
      mode: "include",
      kind: "playlist",
      name: "s",
    };
    overrides[autoDownloadKey("playlist", "r")] = {
      mode: "exclude",
      kind: "playlist",
      name: "r",
    };
    expect(isPlaylistIncluded(overrides, smart, true)).toBe(true);
    expect(isPlaylistIncluded(overrides, regular, false)).toBe(false);
  });
});

describe("needsCollectionFetch", () => {
  const downloaded = byId([track("a"), track("b")]);
  const fetch = (
    existing: OfflineCollection | undefined,
    version: string,
    queued: string[] = [],
    songCount = 2,
  ) =>
    needsCollectionFetch(
      existing,
      songCount,
      version,
      downloaded,
      new Set(queued),
    );

  it("fetches what the rule doesn't hold yet, or the library sync holds", () => {
    expect(fetch(undefined, "v1")).toBe(true);
    expect(fetch(collection("x", "album", ["a"], "auto"), "v1")).toBe(true);
  });

  it("never fetches an empty one the rule doesn't hold yet", () => {
    expect(fetch(undefined, "v1", [], 0)).toBe(false);
  });

  it("refetches one the rule holds that was emptied on the server", () => {
    expect(fetch(collection("x", "playlist", ["a"], "rule"), "v2", [], 0)).toBe(
      true,
    );
  });

  it("never fetches what the user saved", () => {
    expect(fetch(collection("x", "album", ["a"]), "v2")).toBe(false);
  });

  it("skips an unchanged, complete download and refetches a changed or incomplete one", () => {
    const held = collection("x", "album", ["a", "b"], "rule");
    expect(fetch(held, "v1")).toBe(false);
    expect(fetch(held, "v2")).toBe(true);

    const missing = collection("y", "album", ["a", "c"], "rule");
    expect(fetch(missing, "v1")).toBe(true);
    expect(fetch(missing, "v1", ["c"])).toBe(false);
  });
});

describe("planAutoDownloadRelease", () => {
  it("releases an unliked album and the tracks only it held", () => {
    const result = plan({
      collections: byId([
        collection("al1", "album", ["a", "b"], "rule"),
        collection("al2", "album", ["c"], "rule"),
      ]),
      tracks: byId([
        track("a", "rule"),
        track("b", "rule"),
        track("c", "rule"),
      ]),
      likedAlbumIds: new Set(["al2"]),
    });

    expect(result.collectionIds).toEqual(["al1"]);
    expect(result.trackIds).toEqual(["a", "b"]);
  });

  it("keeps a released album's track that is still liked or listed elsewhere", () => {
    const result = plan({
      collections: byId([
        collection("al1", "album", ["a", "b", "c"], "rule"),
        collection("mine", "playlist", ["b"]),
      ]),
      tracks: byId([
        track("a", "rule"),
        track("b", "rule"),
        track("c", "rule"),
      ]),
      likedSongIds: ["a"],
      likedAlbumIds: new Set(),
    });

    expect(result.collectionIds).toEqual(["al1"]);
    expect(result.trackIds).toEqual(["c"]);
  });

  it("keeps everything a rule holds when the server wasn't listed", () => {
    const result = plan({
      collections: byId([collection("al1", "album", ["a"], "rule")]),
      tracks: byId([track("a", "rule")]),
    });

    expect(result).toEqual({ collectionIds: [], trackIds: [], queuedIds: [] });
  });

  it("releases everything a switched-off rule holds, without a listing", () => {
    const result = plan({
      collections: byId([
        collection("al1", "album", ["a"], "rule"),
        collection("pl1", "playlist", ["b"], "rule"),
      ]),
      tracks: byId([track("a", "rule"), track("b", "rule")]),
      queue: [queued("q", "rule")],
      rules: { ...ALL_ON, likedAlbums: false },
    });

    expect(result.collectionIds).toEqual(["al1"]);
    expect(result.trackIds).toEqual(["a"]);
    expect(result.queuedIds).toEqual(["q"]);
  });

  it("releases liked songs once the liked-songs rule is off", () => {
    const result = plan({
      tracks: byId([track("a", "rule"), track("b", "user")]),
      queue: [queued("c", "rule"), queued("d", "user")],
      rules: { ...ALL_ON, likedSongs: false },
      likedSongIds: ["a", "b", "c", "d"],
    });

    expect(result.trackIds).toEqual(["a"]);
    expect(result.queuedIds).toEqual(["c"]);
  });

  it("releases an unliked song but not one still liked or excluded from another rule", () => {
    const result = plan({
      tracks: byId([track("a", "rule"), track("b", "rule")]),
      likedSongIds: ["b"],
    });

    expect(result.trackIds).toEqual(["a"]);
  });

  it("releases an excluded album or song even without a listing", () => {
    const result = plan({
      collections: byId([collection("al1", "album", ["a"], "rule")]),
      tracks: byId([track("a", "rule"), track("s", "rule")]),
      likedSongIds: ["s"],
      overrides: {
        "album:al1": { mode: "exclude", kind: "album", name: "al1" },
        "song:s": { mode: "exclude", kind: "song", name: "s" },
      },
    });

    expect(result.collectionIds).toEqual(["al1"]);
    expect(result.trackIds.sort()).toEqual(["a", "s"]);
  });

  it("releases no track before the liked songs were ever listed", () => {
    const result = plan({
      collections: byId([collection("al1", "album", ["a"], "rule")]),
      tracks: byId([track("a", "rule"), track("b", "rule")]),
      likedSongIds: null,
      likedAlbumIds: new Set(),
    });

    expect(result.collectionIds).toEqual(["al1"]);
    expect(result.trackIds).toEqual([]);
  });

  it("never touches hand saves or the library sync's content", () => {
    const result = plan({
      collections: byId([
        collection("u", "album", ["a"]),
        collection("x", "album", ["b"], "auto"),
      ]),
      tracks: byId([track("a"), track("b", "auto"), track("c", "user")]),
      queue: [queued("d", "auto")],
      rules: { likedSongs: false, likedAlbums: false, playlists: false },
      likedAlbumIds: new Set(),
    });

    expect(result).toEqual({ collectionIds: [], trackIds: [], queuedIds: [] });
  });
});
