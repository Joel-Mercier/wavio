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
  useAuthBase: {
    getState: () => ({ url: "u", username: "n", serverType: "navidrome" }),
  },
  currentAuthScope: () => "scope",
}));

// The axios instance itself is stubbed rather than the axios module: the real
// one registers a request interceptor at import time, which a bare stub has no
// way to accept.
jest.mock("@/services/listenBrainz", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

import listenBrainzApiInstance from "@/services/listenBrainz";
import {
  fetchCreatedForPlaylists,
  fetchPlaylist,
  playlistMbidFromIdentifier,
  toPlaylistTrack,
} from "@/services/listenBrainz/playlists";
import type { JspfPlaylist, JspfTrack } from "@/services/listenBrainz/types";
import {
  JSPF_PLAYLIST_EXT,
  JSPF_TRACK_EXT,
} from "@/services/listenBrainz/types";
import { useListenBrainzBase } from "@/stores/listenBrainz";

const getMock = listenBrainzApiInstance.get as jest.Mock;

beforeEach(() => {
  getMock.mockReset();
  useListenBrainzBase.setState({ token: "token", userName: "joel" });
});

const summary = (
  mbid: string,
  sourcePatch: string,
  date = "2026-08-10T22:12:08.606938+00:00",
): { playlist: JspfPlaylist } => ({
  playlist: {
    date,
    identifier: `https://listenbrainz.org/playlist/${mbid}`,
    title: `${sourcePatch} for joel`,
    track: [],
    extension: {
      [JSPF_PLAYLIST_EXT]: {
        public: true,
        created_for: "joel",
        additional_metadata: {
          algorithm_metadata: { source_patch: sourcePatch },
          expires_at: "2026-08-24T22:12:06.026175",
        },
      },
    },
  },
});

describe("fetchCreatedForPlaylists", () => {
  it("keeps only the three surfaced patches, in display order", async () => {
    getMock.mockResolvedValue({
      status: 200,
      data: {
        playlist_count: 4,
        playlists: [
          // API order is newest-first and interleaves the yearly sets.
          summary("aaaaaaaa-0000-4000-8000-000000000001", "weekly-exploration"),
          summary("aaaaaaaa-0000-4000-8000-000000000002", "daily-jams"),
          summary(
            "aaaaaaaa-0000-4000-8000-000000000003",
            "top-discoveries-of-2025",
          ),
          summary("aaaaaaaa-0000-4000-8000-000000000004", "weekly-jams"),
        ],
      },
    });

    const result = await fetchCreatedForPlaylists();

    expect(result.map((p) => p.patch)).toEqual([
      "daily-jams",
      "weekly-jams",
      "weekly-exploration",
    ]);
    expect(result[0].mbid).toBe("aaaaaaaa-0000-4000-8000-000000000002");
    expect(result[0].expiresAt).toBe("2026-08-24T22:12:06.026175");
  });

  it("keeps the newest of a repeated patch", async () => {
    getMock.mockResolvedValue({
      status: 200,
      data: {
        playlists: [
          summary(
            "aaaaaaaa-0000-4000-8000-00000000000a",
            "daily-jams",
            "2026-08-11",
          ),
          summary(
            "aaaaaaaa-0000-4000-8000-00000000000b",
            "daily-jams",
            "2026-08-10",
          ),
        ],
      },
    });

    const result = await fetchCreatedForPlaylists();

    expect(result).toHaveLength(1);
    expect(result[0].mbid).toBe("aaaaaaaa-0000-4000-8000-00000000000a");
    expect(result[0].createdAt).toBe("2026-08-11");
  });

  it.each([
    [
      "an account with no generated playlists",
      { playlist_count: 0, playlists: [] },
    ],
    ["a response with no playlists key", { playlist_count: 0 }],
    [
      "only unsupported patches",
      {
        playlists: [
          summary(
            "aaaaaaaa-0000-4000-8000-00000000000c",
            "top-missed-recordings-of-2024",
          ),
        ],
      },
    ],
  ])("returns an empty list for %s", async (_name, data) => {
    getMock.mockResolvedValue({ status: 200, data });
    await expect(fetchCreatedForPlaylists()).resolves.toEqual([]);
  });

  it("throws when no account is connected", async () => {
    useListenBrainzBase.setState({ token: "", userName: null });
    await expect(fetchCreatedForPlaylists()).rejects.toThrow("not connected");
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe("playlistMbidFromIdentifier", () => {
  const mbid = "73d66a64-d05f-4d82-abaa-81b2f1a85894";

  it.each([
    ["a bare string", `https://listenbrainz.org/playlist/${mbid}`],
    ["an array", [`https://listenbrainz.org/playlist/${mbid}`]],
    [
      "an array whose match is not first",
      ["https://example.com/nope", `https://listenbrainz.org/playlist/${mbid}`],
    ],
  ])("reads the mbid from %s", (_name, identifier) => {
    expect(playlistMbidFromIdentifier(identifier)).toBe(mbid);
  });

  it.each([
    ["undefined", undefined],
    ["an empty array", []],
    ["an unrelated url", "https://listenbrainz.org/user/joel"],
    ["a non-uuid tail", "https://listenbrainz.org/playlist/not-a-uuid"],
  ])("returns null for %s", (_name, identifier) => {
    expect(playlistMbidFromIdentifier(identifier as never)).toBeNull();
  });
});

describe("toPlaylistTrack", () => {
  const recordingMbid = "61800c28-9089-4ad5-b06a-3abfde90873d";
  const artistMbid = "a1d77dd4-8728-4a47-bdfa-9663d791139c";

  const full: JspfTrack = {
    title: "Cascade",
    creator: "The Future Sound of London",
    album: "Lifeforms",
    duration: 360306,
    identifier: [`https://musicbrainz.org/recording/${recordingMbid}`],
    extension: {
      [JSPF_TRACK_EXT]: {
        added_by: "troi-bot",
        artist_identifiers: [`https://musicbrainz.org/artist/${artistMbid}`],
        additional_metadata: {
          artists: [
            {
              artist_credit_name: "The Future Sound of London",
              artist_mbid: artistMbid,
              join_phrase: "",
            },
          ],
          caa_id: 30438815070,
          caa_release_mbid: "4a0efc8f-0d1f-4b7b-848d-151d3b239076",
        },
      },
    },
  };

  it("normalises a complete track", () => {
    expect(toPlaylistTrack(full, 0)).toEqual({
      key: recordingMbid,
      title: "Cascade",
      artist: "The Future Sound of London",
      primaryArtist: "The Future Sound of London",
      album: "Lifeforms",
      // JSPF durations are already milliseconds and must not be scaled.
      durationMs: 360306,
      recordingMbid,
      artistMbids: [artistMbid],
      coverArtUrl:
        "https://archive.org/download/mbid-4a0efc8f-0d1f-4b7b-848d-151d3b239076/mbid-4a0efc8f-0d1f-4b7b-848d-151d3b239076-30438815070_thumb250.jpg",
    });
  });

  it("reads the recording mbid from the legacy string identifier", () => {
    const track = toPlaylistTrack(
      {
        ...full,
        identifier: `https://musicbrainz.org/recording/${recordingMbid}`,
      },
      0,
    );
    expect(track?.recordingMbid).toBe(recordingMbid);
  });

  it("lowercases the recording mbid", () => {
    const track = toPlaylistTrack(
      {
        ...full,
        identifier: [
          `https://musicbrainz.org/recording/${recordingMbid.toUpperCase()}`,
        ],
      },
      0,
    );
    expect(track?.recordingMbid).toBe(recordingMbid);
  });

  it("joins a multi-artist credit and keeps the lead separately", () => {
    const track = toPlaylistTrack(
      {
        title: "Bad Kingdom",
        creator: "Moderat feat. Someone",
        extension: {
          [JSPF_TRACK_EXT]: {
            additional_metadata: {
              artists: [
                { artist_credit_name: "Moderat", join_phrase: " feat. " },
                { artist_credit_name: "Someone", join_phrase: "" },
              ],
            },
          },
        },
      },
      3,
    );

    expect(track?.artist).toBe("Moderat feat. Someone");
    expect(track?.primaryArtist).toBe("Moderat");
  });

  it("falls back to creator and a positional key with no extension", () => {
    const track = toPlaylistTrack({ title: "Alive", creator: "Anon" }, 7);

    expect(track).toEqual({
      key: "7:Alive:Anon",
      title: "Alive",
      artist: "Anon",
      primaryArtist: "Anon",
      album: undefined,
      durationMs: undefined,
      recordingMbid: undefined,
      artistMbids: [],
      coverArtUrl: undefined,
    });
  });

  it.each([
    ["no title", { creator: "Anon" }],
    ["a blank title", { title: "  ", creator: "Anon" }],
    ["no artist", { title: "Alive" }],
    ["a blank artist", { title: "Alive", creator: "  " }],
  ])("drops a track with %s", (_name, track) => {
    expect(toPlaylistTrack(track as JspfTrack, 0)).toBeNull();
  });

  it("ignores a non-positive duration", () => {
    expect(
      toPlaylistTrack({ ...full, duration: 0 }, 0)?.durationMs,
    ).toBeUndefined();
  });
});

describe("fetchPlaylist", () => {
  it("maps tracks and drops the unnamed ones", async () => {
    getMock.mockResolvedValue({
      status: 200,
      data: {
        playlist: {
          title: "Daily Jams for joel",
          track: [
            { title: "Cascade", creator: "FSOL" },
            { creator: "Nameless" },
            { title: "Bad Kingdom", creator: "Moderat" },
          ],
        },
      },
    });

    const tracks = await fetchPlaylist("73d66a64-d05f-4d82-abaa-81b2f1a85894");

    expect(tracks.map((t) => t.title)).toEqual(["Cascade", "Bad Kingdom"]);
  });

  it("returns an empty list for a playlist with no tracks", async () => {
    getMock.mockResolvedValue({ status: 200, data: { playlist: {} } });
    await expect(fetchPlaylist("mbid")).resolves.toEqual([]);
  });
});
