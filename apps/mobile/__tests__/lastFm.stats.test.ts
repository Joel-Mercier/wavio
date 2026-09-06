jest.mock("@/services/lastFm/client", () => ({
  callRead: jest.fn(),
  callSigned: jest.fn(),
}));

import { callRead } from "@/services/lastFm/client";
import { pickImageUrl } from "@/services/lastFm/images";
import {
  fetchRecentTracks,
  fetchTopAlbums,
  fetchTopArtists,
  fetchTopTracks,
  fetchUserInfo,
} from "@/services/lastFm/stats";
import type { StatsResult } from "@/services/scrobbling/stats";

const mockCallRead = callRead as jest.Mock;

/** Narrows the shared union, which only ever resolves to `ready` for Last.fm. */
const dataOf = <T>(result: StatsResult<T>): T => {
  if (result.state !== "ready") throw new Error("expected a ready result");
  return result.data;
};

const image = (url: string, size: string) => ({ "#text": url, size });

beforeEach(() => {
  mockCallRead.mockReset();
});

describe("pickImageUrl", () => {
  it("prefers the largest usable size", () => {
    expect(
      pickImageUrl([
        image("small.png", "small"),
        image("large.png", "large"),
        image("xl.png", "extralarge"),
      ]),
    ).toBe("xl.png");
  });

  it("rejects the grey placeholder Last.fm serves for every artist", () => {
    expect(
      pickImageUrl([
        image(
          "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png",
          "extralarge",
        ),
      ]),
    ).toBeUndefined();
  });

  it("handles the all-empty array Last.fm sends for art it doesn't have", () => {
    expect(
      pickImageUrl([image("", "small"), image("  ", "extralarge")]),
    ).toBeUndefined();
    expect(pickImageUrl(undefined)).toBeUndefined();
  });

  it("falls back to the last usable entry when no size matches", () => {
    expect(pickImageUrl([{ "#text": "only.png" }])).toBe("only.png");
  });
});

describe("fetchTopArtists", () => {
  it("maps rows and reads the string playcount and rank", async () => {
    mockCallRead.mockResolvedValue({
      topartists: {
        artist: [
          {
            name: "Pearl Jam",
            mbid: "mbid-1",
            playcount: "412",
            "@attr": { rank: "1" },
          },
          { name: "Soundgarden", playcount: "77", "@attr": { rank: "2" } },
        ],
      },
    });

    const items = dataOf(
      await fetchTopArtists({ userName: "someone", period: "7day" }),
    );

    expect(items).toEqual([
      { key: "mbid-1", rank: 1, title: "Pearl Jam", listenCount: 412 },
      { key: "Soundgarden-1", rank: 2, title: "Soundgarden", listenCount: 77 },
    ]);
    // No artwork on artists: every Last.fm artist image is the same placeholder.
    expect(items.every((item) => item.artworkUrl === undefined)).toBe(true);
  });

  it("asks for the period as an unsigned read", async () => {
    mockCallRead.mockResolvedValue({ topartists: { artist: [] } });

    await fetchTopArtists({ userName: "someone", period: "overall" });

    expect(mockCallRead).toHaveBeenCalledWith(
      "user.getTopArtists",
      { user: "someone", period: "overall", limit: 10 },
      { signal: undefined },
    );
  });

  it("reads a top list of exactly one, which arrives as an object", async () => {
    mockCallRead.mockResolvedValue({
      topartists: { artist: { name: "Pearl Jam", playcount: "1" } },
    });

    const items = dataOf(
      await fetchTopArtists({ userName: "someone", period: "7day" }),
    );

    expect(items).toHaveLength(1);
    // No @attr rank on the single-entry shape: fall back to the position.
    expect(items[0].rank).toBe(1);
  });

  it("survives an account with no listens in the period", async () => {
    mockCallRead.mockResolvedValue({ topartists: {} });

    expect(
      dataOf(await fetchTopArtists({ userName: "someone", period: "7day" })),
    ).toEqual([]);
  });
});

describe("fetchTopAlbums", () => {
  it("carries the artist as a subtitle and keeps real cover art", async () => {
    mockCallRead.mockResolvedValue({
      topalbums: {
        album: [
          {
            name: "Ten",
            mbid: "album-1",
            playcount: "30",
            artist: { name: "Pearl Jam" },
            image: [image("ten.png", "extralarge")],
            "@attr": { rank: "1" },
          },
        ],
      },
    });

    expect(
      dataOf(await fetchTopAlbums({ userName: "someone", period: "1month" })),
    ).toEqual([
      {
        key: "album-1",
        rank: 1,
        title: "Ten",
        subtitle: "Pearl Jam",
        listenCount: 30,
        artworkUrl: "ten.png",
      },
    ]);
  });
});

describe("fetchTopTracks", () => {
  it("falls back to an artist/title key when the mbid is empty", async () => {
    mockCallRead.mockResolvedValue({
      toptracks: {
        track: [
          {
            name: "Alive",
            mbid: "",
            playcount: "9",
            artist: { name: "Pearl Jam" },
          },
        ],
      },
    });

    const items = dataOf(
      await fetchTopTracks({ userName: "someone", period: "12month" }),
    );

    expect(items[0].key).toBe("Pearl Jam-Alive-0");
  });
});

describe("fetchUserInfo", () => {
  it("reads the counts and the registration date", async () => {
    mockCallRead.mockResolvedValue({
      user: {
        name: "someone",
        playcount: "48219",
        artist_count: "1200",
        album_count: "3400",
        track_count: "9000",
        registered: { unixtime: "1157128225", "#text": 1157128225 },
        url: "https://www.last.fm/user/someone",
      },
    });

    expect(await fetchUserInfo({ userName: "someone" })).toEqual({
      name: "someone",
      playCount: 48219,
      artistCount: 1200,
      albumCount: 3400,
      trackCount: 9000,
      registeredAt: 1157128225,
      url: "https://www.last.fm/user/someone",
    });
  });

  it("falls back to #text when unixtime is absent", async () => {
    mockCallRead.mockResolvedValue({
      user: { name: "someone", registered: { "#text": 1157128225 } },
    });

    const info = await fetchUserInfo({ userName: "someone" });

    expect(info.registeredAt).toBe(1157128225);
    expect(info.playCount).toBe(0);
  });

  it("reports no registration date rather than the epoch", async () => {
    mockCallRead.mockResolvedValue({ user: { name: "someone" } });

    expect((await fetchUserInfo({ userName: "someone" })).registeredAt).toBe(
      null,
    );
  });
});

describe("fetchRecentTracks", () => {
  it("requests extended=1, which is what carries the loved flag", async () => {
    mockCallRead.mockResolvedValue({ recenttracks: { track: [] } });

    await fetchRecentTracks({ userName: "someone" });

    expect(mockCallRead).toHaveBeenCalledWith(
      "user.getRecentTracks",
      { user: "someone", limit: 10, extended: 1 },
      { signal: undefined },
    );
  });

  it("marks the now-playing entry, which carries no timestamp", async () => {
    mockCallRead.mockResolvedValue({
      recenttracks: {
        track: [
          {
            name: "Alive",
            artist: { name: "Pearl Jam" },
            album: { "#text": "Ten" },
            loved: "1",
            "@attr": { nowplaying: "true" },
          },
          {
            name: "Black",
            artist: { name: "Pearl Jam" },
            loved: "0",
            date: { uts: "1700000000" },
          },
        ],
      },
    });

    const tracks = dataOf(await fetchRecentTracks({ userName: "someone" }));

    expect(tracks[0]).toMatchObject({
      name: "Alive",
      artist: "Pearl Jam",
      album: "Ten",
      loved: true,
      nowPlaying: true,
      playedAt: null,
    });
    expect(tracks[1]).toMatchObject({
      loved: false,
      nowPlaying: false,
      playedAt: 1700000000,
    });
  });

  it("reads the artist from #text when extended is not honoured", async () => {
    mockCallRead.mockResolvedValue({
      recenttracks: {
        track: [{ name: "Alive", artist: { "#text": "Pearl Jam" } }],
      },
    });

    const tracks = dataOf(await fetchRecentTracks({ userName: "someone" }));

    expect(tracks[0].artist).toBe("Pearl Jam");
  });

  it("gives repeats of the same track distinct keys", async () => {
    mockCallRead.mockResolvedValue({
      recenttracks: {
        track: [
          {
            name: "Alive",
            artist: { name: "Pearl Jam" },
            date: { uts: "1700000000" },
          },
          {
            name: "Alive",
            artist: { name: "Pearl Jam" },
            date: { uts: "1700000000" },
          },
        ],
      },
    });

    const tracks = dataOf(await fetchRecentTracks({ userName: "someone" }));

    expect(tracks[0].key).not.toBe(tracks[1].key);
  });

  it("drops rows with no artist", async () => {
    mockCallRead.mockResolvedValue({
      recenttracks: { track: [{ name: "Alive" }] },
    });

    expect(dataOf(await fetchRecentTracks({ userName: "someone" }))).toEqual(
      [],
    );
  });
});
