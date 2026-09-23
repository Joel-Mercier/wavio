import {
  artistTracksFromDownloads,
  collectionArtistCredits,
  collectionCreditsArtist,
  offlineCollectionToAlbum,
  offlineCollectionToPlaylist,
  offlineTrackToChild,
} from "@/services/offline/collections";
import type { OfflineCollection, OfflineTrack } from "@/stores/offline";

const makeTrack = (
  id: string,
  over: Partial<OfflineTrack> = {},
): OfflineTrack => ({
  id,
  title: `Track ${id}`,
  artist: `Artist ${id}`,
  album: `Album ${id}`,
  duration: 100,
  coverArt: `cover-${id}`,
  path: `/tmp/${id}.flac`,
  size: 1000,
  downloadedAt: new Date().toISOString(),
  ...over,
});

const tracks: Record<string, OfflineTrack> = {
  a: makeTrack("a"),
  b: makeTrack("b"),
};

describe("artistTracksFromDownloads", () => {
  const albums = [
    { id: "al1", name: "First" },
    { id: "al2", name: "Second" },
  ];

  it("keeps the artist's albums, in discography then disc/track order", () => {
    const result = artistTracksFromDownloads(
      [
        offlineTrackToChild(makeTrack("x", { albumId: "other" })),
        offlineTrackToChild(makeTrack("b2", { albumId: "al2", track: 2 })),
        offlineTrackToChild(makeTrack("a1", { albumId: "al1", track: 1 })),
        offlineTrackToChild(makeTrack("b1", { albumId: "al2", track: 1 })),
        offlineTrackToChild(
          makeTrack("a0", { albumId: "al1", discNumber: 2, track: 1 }),
        ),
      ],
      albums,
    );
    expect(result.map((t) => t.id)).toEqual(["a1", "a0", "b1", "b2"]);
  });

  it("matches downloads recorded without an albumId by album name", () => {
    const result = artistTracksFromDownloads(
      [
        offlineTrackToChild(makeTrack("legacy", { album: "Second" })),
        offlineTrackToChild(makeTrack("stranger", { album: "Elsewhere" })),
      ],
      albums,
    );
    expect(result.map((t) => t.id)).toEqual(["legacy"]);
  });
});

describe("offlineTrackToChild", () => {
  it("carries the albumId recorded at download time", () => {
    expect(
      offlineTrackToChild(makeTrack("a", { albumId: "al1" })).albumId,
    ).toBe("al1");
  });

  it("maps a downloaded track to a Subsonic Child and infers suffix from path", () => {
    const child = offlineTrackToChild(makeTrack("a", { path: "/x/a.mp3" }));
    expect(child).toMatchObject({
      id: "a",
      isDir: false,
      title: "Track a",
      suffix: "mp3",
    });
  });

  it("carries the tag fields the sort options need", () => {
    const child = offlineTrackToChild(
      makeTrack("a", {
        albumArtist: "Album Artist",
        year: 1994,
        genre: "Jazz",
        sortName: "Track a, The",
      }),
    );
    expect(child).toMatchObject({
      displayAlbumArtist: "Album Artist",
      year: 1994,
      genre: "Jazz",
      sortName: "Track a, The",
    });
  });
});

describe("offlineCollectionToPlaylist", () => {
  const collection: OfflineCollection = {
    id: "p1",
    kind: "playlist",
    name: "My Playlist",
    songCount: 2,
    trackIds: ["a", "b"],
    coverArt: "pl-cover",
    owner: "joel",
    savedAt: "2026-06-01T00:00:00.000Z",
  };

  it("rebuilds the playlist envelope with ordered entries and summed duration", () => {
    const { playlist } = {
      playlist: offlineCollectionToPlaylist(collection, tracks),
    };
    expect(playlist.id).toBe("p1");
    expect(playlist.name).toBe("My Playlist");
    expect(playlist.owner).toBe("joel");
    expect(playlist.songCount).toBe(2);
    expect(playlist.duration).toBe(200);
    expect(playlist.entry?.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("skips track ids whose file is no longer in the store", () => {
    const playlist = offlineCollectionToPlaylist(
      { ...collection, trackIds: ["a", "missing", "b"] },
      tracks,
    );
    expect(playlist.entry?.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("offlineCollectionToAlbum", () => {
  it("rebuilds the album envelope with artist metadata", () => {
    const album = offlineCollectionToAlbum(
      {
        id: "al1",
        kind: "album",
        name: "My Album",
        songCount: 1,
        trackIds: ["a"],
        artist: "Artist X",
        artistId: "ax",
        year: 2020,
        savedAt: "2026-06-01T00:00:00.000Z",
      },
      tracks,
    );
    expect(album).toMatchObject({
      id: "al1",
      name: "My Album",
      artist: "Artist X",
      artistId: "ax",
      year: 2020,
    });
    expect(album.song?.map((t) => t.id)).toEqual(["a"]);
  });
});

describe("artist credits", () => {
  const multiArtistAlbum: OfflineCollection = {
    id: "al1",
    kind: "album",
    name: "Split Album",
    songCount: 2,
    trackIds: ["a", "b"],
    artist: "Primary",
    artistId: "ar1",
    artists: [
      { id: "ar1", name: "Primary" },
      { id: "ar2", name: "Featured" },
    ],
    savedAt: new Date().toISOString(),
  };

  it("collectionCreditsArtist matches primary and credited artists", () => {
    expect(collectionCreditsArtist(multiArtistAlbum, "ar1")).toBe(true);
    expect(collectionCreditsArtist(multiArtistAlbum, "ar2")).toBe(true);
    expect(collectionCreditsArtist(multiArtistAlbum, "ar3")).toBe(false);
  });

  it("collectionCreditsArtist falls back to artistId when credits are absent", () => {
    const legacy: OfflineCollection = {
      ...multiArtistAlbum,
      artists: undefined,
    };
    expect(collectionCreditsArtist(legacy, "ar1")).toBe(true);
    expect(collectionCreditsArtist(legacy, "ar2")).toBe(false);
  });

  it("collectionCreditsArtist never matches playlists", () => {
    const playlist: OfflineCollection = {
      ...multiArtistAlbum,
      kind: "playlist",
    };
    expect(collectionCreditsArtist(playlist, "ar1")).toBe(false);
  });

  it("collectionArtistCredits lists primary first and dedupes", () => {
    expect(collectionArtistCredits(multiArtistAlbum)).toEqual([
      { id: "ar1", name: "Primary" },
      { id: "ar2", name: "Featured" },
    ]);
  });
});
