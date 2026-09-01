// Mock MMKV-backed storage with an in-memory implementation
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

jest.mock("@/services/openSubsonic", () => ({
  isSubsonicDataNotFound: (error: unknown) =>
    (error as { code?: number } | null)?.code === 70,
}));

import { forgetDeletedPlaylist } from "@/services/forgetPlaylist";
import { isNotFoundError } from "@/services/notFound";
import useOffline, { type OfflineCollection } from "@/stores/offline";
import usePlaylists from "@/stores/playlists";
import useRecentPlays, { type RecentPlay } from "@/stores/recentPlays";

const playlist = (id: string): RecentPlay => ({
  id,
  title: `t-${id}`,
  type: "playlist",
});

const collection = (id: string): OfflineCollection => ({
  id,
  kind: "playlist",
  name: `t-${id}`,
  songCount: 1,
  trackIds: ["s1"],
  savedAt: new Date().toISOString(),
  source: "user",
});

beforeEach(() => {
  useRecentPlays.setState({ recentPlays: [] }, false);
  usePlaylists.setState(
    { playlistSorts: {}, playlistTrackOrders: {}, deletedPlaylists: {} },
    false,
  );
  useOffline.setState({ downloadedCollections: {} }, false);
});

describe("isNotFoundError", () => {
  it("matches Subsonic code 70 and HTTP 404", () => {
    expect(isNotFoundError({ code: 70 })).toBe(true);
    expect(
      isNotFoundError({ isAxiosError: true, response: { status: 404 } }),
    ).toBe(true);
  });

  it("ignores other failures", () => {
    expect(isNotFoundError({ code: 50 })).toBe(false);
    expect(
      isNotFoundError({ isAxiosError: true, response: { status: 500 } }),
    ).toBe(false);
    expect(isNotFoundError(new Error("boom"))).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
  });
});

describe("forgetDeletedPlaylist", () => {
  it("drops the home shortcut and the saved preferences", () => {
    useRecentPlays.getState().addRecentPlay(playlist("p1"));
    usePlaylists.getState().setPlaylistSort("p1", "alphabeticalAsc");
    usePlaylists.getState().setPlaylistTrackOrder("p1", ["s1"]);

    forgetDeletedPlaylist("p1");

    expect(useRecentPlays.getState().recentPlays).toEqual([]);
    expect(usePlaylists.getState().playlistSorts).toEqual({});
    expect(usePlaylists.getState().playlistTrackOrders).toEqual({});
  });

  it("leaves other playlists alone", () => {
    useRecentPlays.getState().addRecentPlay(playlist("p1"));
    useRecentPlays.getState().addRecentPlay(playlist("p2"));
    usePlaylists.getState().setPlaylistSort("p2", "alphabeticalAsc");

    forgetDeletedPlaylist("p1");

    expect(useRecentPlays.getState().recentPlays.map((p) => p.id)).toEqual([
      "p2",
    ]);
    expect(usePlaylists.getState().playlistSorts).toEqual({
      p2: "alphabeticalAsc",
    });
  });

  // A downloaded playlist stays browsable through useOfflinePlaylist even once
  // the server drops it, so its shortcut still works and must survive the
  // self-healing path — and so must the sort / manual order the offline copy is
  // rendered with.
  it("keeps a downloaded playlist's shortcut and preferences when asked to", () => {
    useRecentPlays.getState().addRecentPlay(playlist("p1"));
    usePlaylists.getState().setPlaylistSort("p1", "alphabeticalAsc");
    usePlaylists.getState().setPlaylistTrackOrder("p1", ["s1"]);
    useOffline.setState({ downloadedCollections: { p1: collection("p1") } });

    forgetDeletedPlaylist("p1", { keepIfDownloaded: true });

    expect(useRecentPlays.getState().recentPlays.map((p) => p.id)).toEqual([
      "p1",
    ]);
    expect(usePlaylists.getState().playlistSorts).toEqual({
      p1: "alphabeticalAsc",
    });
    expect(usePlaylists.getState().playlistTrackOrders).toEqual({ p1: ["s1"] });
  });

  it("still drops the shortcut of a downloaded playlist on an explicit delete", () => {
    useRecentPlays.getState().addRecentPlay(playlist("p1"));
    useOffline.setState({ downloadedCollections: { p1: collection("p1") } });

    forgetDeletedPlaylist("p1");

    expect(useRecentPlays.getState().recentPlays).toEqual([]);
  });

  it("marks the id deleted on both paths so its queries stay disabled", () => {
    useOffline.setState({ downloadedCollections: { p1: collection("p1") } });

    forgetDeletedPlaylist("p1", { keepIfDownloaded: true });
    forgetDeletedPlaylist("p2");

    expect(usePlaylists.getState().deletedPlaylists).toEqual({
      p1: true,
      p2: true,
    });
  });

  it("lifts the marker when the id shows up in a listing again", () => {
    forgetDeletedPlaylist("p1");
    forgetDeletedPlaylist("p2");

    usePlaylists.getState().reconcileDeletedPlaylists(["p2", "p3"]);

    expect(usePlaylists.getState().deletedPlaylists).toEqual({ p1: true });
  });
});
