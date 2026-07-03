import { QueryClient } from "@tanstack/react-query";
import {
  buildOfflineSearchCorpus,
  createOfflineSearchIndex,
  searchOfflineIndex,
} from "@/services/offline/searchCorpus";
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
  downloadedAt: "2026-06-01T00:00:00.000Z",
  ...over,
});

const makeAlbumCollection = (
  id: string,
  over: Partial<OfflineCollection> = {},
): OfflineCollection => ({
  id,
  kind: "album",
  name: `Album ${id}`,
  songCount: 1,
  trackIds: [],
  savedAt: "2026-06-01T00:00:00.000Z",
  ...over,
});

describe("buildOfflineSearchCorpus", () => {
  it("returns an empty corpus with no downloads and an empty cache", () => {
    const corpus = buildOfflineSearchCorpus(new QueryClient(), {}, {});
    expect(corpus).toEqual({ songs: [], albums: [], artists: [] });
  });

  it("enriches downloaded songs with the owning album's id", () => {
    const tracks = { t1: makeTrack("t1", { title: "Midnight City" }) };
    const collections = {
      al1: makeAlbumCollection("al1", { trackIds: ["t1"] }),
    };
    const corpus = buildOfflineSearchCorpus(
      new QueryClient(),
      tracks,
      collections,
    );
    expect(corpus.songs).toHaveLength(1);
    expect(corpus.songs[0]).toMatchObject({ id: "t1", albumId: "al1" });
  });

  it("surfaces a downloaded album but not its artist (no offline artist detail)", () => {
    const collections = {
      al1: makeAlbumCollection("al1", { artist: "M83", artistId: "ar1" }),
    };
    const corpus = buildOfflineSearchCorpus(new QueryClient(), {}, collections);
    expect(corpus.albums.map((a) => a.id)).toEqual(["al1"]);
    // The artist has no `["artist", id]` cache, so tapping it would land on an
    // empty ArtistDetail — it must not be surfaced.
    expect(corpus.artists).toEqual([]);
  });

  it("lets server-shaped cache entries overwrite store-reconstructed ones", () => {
    const collections = {
      al1: makeAlbumCollection("al1", { name: "Store Album" }),
    };
    const queryClient = new QueryClient();
    queryClient.setQueryData(["album", "al1"], {
      album: {
        id: "al1",
        name: "Server Album",
        songCount: 5,
        duration: 300,
        created: new Date(),
      },
    });
    const corpus = buildOfflineSearchCorpus(queryClient, {}, collections);
    const al1 = corpus.albums.find((a) => a.id === "al1");
    expect(al1?.name).toBe("Server Album");
    expect(corpus.albums).toHaveLength(1);
  });

  it("surfaces a cached album/artist detail and harvests their songs", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["album", "al1"], {
      album: {
        id: "al1",
        name: "Discovery",
        songCount: 1,
        duration: 0,
        created: new Date(),
        song: [{ id: "s1", title: "One More Time" }],
      },
    });
    queryClient.setQueryData(["artist", "ar1"], {
      artist: { id: "ar1", name: "Daft Punk", albumCount: 2 },
    });
    const corpus = buildOfflineSearchCorpus(queryClient, {}, {});
    expect(corpus.albums.map((a) => a.id)).toEqual(["al1"]);
    expect(corpus.artists.map((a) => a.id)).toEqual(["ar1"]);
    expect(corpus.songs.map((s) => s.id)).toEqual(["s1"]);
  });

  it("drops metadata-only entries that can't be opened offline", () => {
    const queryClient = new QueryClient();
    // An artist detail is cached (openable), but the album nested on it has no
    // `["album", id]` cache of its own — it must not be surfaced.
    queryClient.setQueryData(["artist", "ar1"], {
      artist: {
        id: "ar1",
        name: "Daft Punk",
        albumCount: 2,
        album: [
          {
            id: "al2",
            name: "Discovery",
            songCount: 14,
            duration: 0,
            created: new Date(),
          },
        ],
      },
    });
    // Albums/artists that live only in list/starred caches aren't openable.
    queryClient.setQueryData(["albumList2", { type: "newest" }], {
      albumList2: {
        album: [
          {
            id: "al3",
            name: "Homework",
            songCount: 16,
            duration: 0,
            created: new Date(),
          },
        ],
      },
    });
    queryClient.setQueryData(["starred2"], {
      starred2: {
        album: [
          {
            id: "al4",
            name: "Random Access",
            songCount: 13,
            duration: 0,
            created: new Date(),
          },
        ],
        artist: [{ id: "ar2", name: "Justice", albumCount: 1 }],
        song: [{ id: "s2", title: "Genesis" }],
      },
    });
    const corpus = buildOfflineSearchCorpus(queryClient, {}, {});
    // Only the cached artist detail survives; every metadata-only album/artist
    // is filtered out. Songs are still harvested (they play from cache/download).
    expect(corpus.albums).toEqual([]);
    expect(corpus.artists.map((a) => a.id)).toEqual(["ar1"]);
    expect(corpus.songs.map((s) => s.id).sort()).toEqual(["s2"]);
  });

  it("tolerates persisted entries whose data is undefined", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["album", "al1"], undefined);
    expect(() => buildOfflineSearchCorpus(queryClient, {}, {})).not.toThrow();
  });
});

describe("searchOfflineIndex", () => {
  const buildIndex = () =>
    createOfflineSearchIndex(
      buildOfflineSearchCorpus(
        new QueryClient(),
        {
          t1: makeTrack("t1", { title: "Midnight City", artist: "M83" }),
          t2: makeTrack("t2", { title: "Outro", artist: "M83" }),
        },
        {
          al1: makeAlbumCollection("al1", {
            name: "Hurry Up We're Dreaming",
            artist: "M83",
            artistId: "ar1",
            trackIds: ["t1", "t2"],
          }),
        },
      ),
    );

  it("matches downloaded songs and albums on a fuzzy query", () => {
    const songMatch = searchOfflineIndex(buildIndex(), "midnight", {
      albumCount: 12,
      artistCount: 12,
      songCount: 12,
    });
    expect(songMatch.song?.map((s) => s.id)).toContain("t1");
    const albumMatch = searchOfflineIndex(buildIndex(), "Hurry", {
      albumCount: 12,
      artistCount: 12,
      songCount: 12,
    });
    expect(albumMatch.album?.map((a) => a.id)).toContain("al1");
  });

  it("honors an explicit 0 cap instead of defaulting to 20", () => {
    const result = searchOfflineIndex(buildIndex(), "M83", {
      albumCount: 12,
      artistCount: 0,
      songCount: 0,
    });
    expect(result.song).toEqual([]);
    expect(result.artist).toEqual([]);
    expect(result.album?.length).toBeGreaterThan(0);
  });

  it("defaults an omitted cap to 20", () => {
    const songs = Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`,
      isDir: false,
      title: "Repeat",
    }));
    const index = createOfflineSearchIndex({ songs, albums: [], artists: [] });
    const result = searchOfflineIndex(index, "Repeat", {});
    expect(result.song?.length).toBe(20);
  });

  it("returns empty arrays when the corpus is empty", () => {
    const index = createOfflineSearchIndex({
      songs: [],
      albums: [],
      artists: [],
    });
    const result = searchOfflineIndex(index, "anything", {});
    expect(result).toEqual({ album: [], artist: [], song: [] });
  });
});
