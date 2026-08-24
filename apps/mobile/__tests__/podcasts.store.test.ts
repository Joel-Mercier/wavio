jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: {
      setItem: (k: string, v: string) => mem.set(k, v),
      getItem: (k: string) => mem.get(k) ?? null,
      removeItem: (k: string) => mem.delete(k),
    },
  };
});

import {
  type PodcastProgressEntry,
  podcastProgressForScope,
  usePodcastsBase,
} from "@/stores/podcasts";

const get = () => usePodcastsBase.getState();

const makePodcast = (overrides: Partial<any> = {}): any => ({
  uuid: "p1",
  name: "Pod",
  genres: ["PODCASTSERIES_TECHNOLOGY"],
  language: "ENGLISH",
  imageUrl: "img",
  authorName: "Author",
  itunesInfo: { country: "UNITED_STATES_OF_AMERICA" },
  ...overrides,
});

const makeChannel = (overrides: Partial<any> = {}): any => ({
  id: "c1",
  title: "Channel",
  url: "https://feed.example/rss.xml",
  coverArt: "cover-1",
  originalImageUrl: "https://img.example/cover.jpg",
  status: "completed",
  ...overrides,
});

beforeEach(() => {
  usePodcastsBase.setState(
    {
      taddyPodcastsApiKey: "",
      taddyPodcastsUserId: "",
      taddyPodcastsLanguage: "ENGLISH",
      taddyPodcastsCountry: "UNITED_STATES_OF_AMERICA",
      favoritePodcasts: [],
      podcastProgress: [],
      lastUsedGenreIndex: 0,
    },
    false,
  );
});

describe("podcasts store - config", () => {
  it("setTaddyPodcastsCredentials updates apiKey and userId", () => {
    get().setTaddyPodcastsCredentials({ apiKey: "k", userId: "u" });
    const s = get();
    expect(s.taddyPodcastsApiKey).toBe("k");
    expect(s.taddyPodcastsUserId).toBe("u");
  });

  it("setTaddyPodcastsCredentials leaves language and country untouched", () => {
    get().setTaddyPodcastsLanguage("FRENCH" as any);
    get().setTaddyPodcastsCountry("FRANCE" as any);
    get().setTaddyPodcastsCredentials({ apiKey: "k", userId: "u" });
    const s = get();
    expect(s.taddyPodcastsLanguage).toBe("FRENCH");
    expect(s.taddyPodcastsCountry).toBe("FRANCE");
  });

  it("clearTaddyPodcastsConfig clears apiKey and userId", () => {
    get().setTaddyPodcastsCredentials({ apiKey: "k", userId: "u" });
    get().clearTaddyPodcastsConfig();
    expect(get().taddyPodcastsApiKey).toBe("");
    expect(get().taddyPodcastsUserId).toBe("");
  });
});

describe("podcasts store - favorites", () => {
  it("addFavoritePodcast prepends and ignores duplicates", () => {
    get().addFavoritePodcast(makePodcast({ uuid: "a" }));
    get().addFavoritePodcast(makePodcast({ uuid: "b" }));
    get().addFavoritePodcast(makePodcast({ uuid: "a" }));
    expect(get().favoritePodcasts.map((p) => p.uuid)).toEqual(["b", "a"]);
  });

  it("addFavoritePodcast tags the favorite with source 'taddy'", () => {
    get().addFavoritePodcast(makePodcast({ uuid: "a" }));
    expect(get().favoritePodcasts[0].source).toBe("taddy");
  });

  it("falls back to store country when itunesInfo.country missing", () => {
    get().addFavoritePodcast(makePodcast({ uuid: "a", itunesInfo: undefined }));
    expect(get().favoritePodcasts[0].country).toBe("UNITED_STATES_OF_AMERICA");
  });

  it("removeFavoritePodcast drops by uuid", () => {
    get().addFavoritePodcast(makePodcast({ uuid: "a" }));
    get().addFavoritePodcast(makePodcast({ uuid: "b" }));
    get().removeFavoritePodcast("a");
    expect(get().favoritePodcasts.map((p) => p.uuid)).toEqual(["b"]);
  });

  it("clearFavoritePodcasts empties the list", () => {
    get().addFavoritePodcast(makePodcast({ uuid: "a" }));
    get().clearFavoritePodcasts();
    expect(get().favoritePodcasts).toEqual([]);
  });
});

describe("podcasts store - server favorites", () => {
  it("addFavoriteServerPodcast stores channel id, scope and source 'server'", () => {
    get().addFavoriteServerPodcast(makeChannel({ id: "c1" }), "scope-a");
    const fav = get().favoritePodcasts[0];
    expect(fav.uuid).toBe("c1");
    expect(fav.source).toBe("server");
    expect(fav.scope).toBe("scope-a");
    expect(fav.coverArt).toBe("cover-1");
    expect(fav.url).toBe("https://feed.example/rss.xml");
    expect(fav.imageUrl).toBe("https://img.example/cover.jpg");
    expect(fav.isFavorite).toBe(true);
  });

  it("addFavoriteServerPodcast falls back to the feed url when title is missing", () => {
    get().addFavoriteServerPodcast(
      makeChannel({ id: "c1", title: undefined }),
      "scope-a",
    );
    expect(get().favoritePodcasts[0].name).toBe("https://feed.example/rss.xml");
  });

  it("addFavoriteServerPodcast ignores duplicates by channel id", () => {
    get().addFavoriteServerPodcast(makeChannel({ id: "c1" }), "scope-a");
    get().addFavoriteServerPodcast(
      makeChannel({ id: "c1", title: "Renamed" }),
      "scope-a",
    );
    expect(get().favoritePodcasts).toHaveLength(1);
    // The duplicate add is a no-op, so the original title is preserved.
    expect(get().favoritePodcasts[0].name).toBe("Channel");
  });

  it("addFavoriteServerPodcast prepends ahead of existing favorites", () => {
    get().addFavoritePodcast(makePodcast({ uuid: "taddy-1" }));
    get().addFavoriteServerPodcast(makeChannel({ id: "c1" }), "scope-a");
    expect(get().favoritePodcasts.map((p) => p.uuid)).toEqual([
      "c1",
      "taddy-1",
    ]);
  });

  it("updateFavoriteServerPodcast patches the matching favorite only", () => {
    get().addFavoriteServerPodcast(makeChannel({ id: "c1" }), "scope-a");
    get().addFavoriteServerPodcast(makeChannel({ id: "c2" }), "scope-a");
    get().updateFavoriteServerPodcast("c1", {
      name: "New name",
      imageUrl: "new-image",
      coverArt: "cover-2",
      url: "https://feed.example/new.xml",
    });
    const c1 = get().favoritePodcasts.find((p) => p.uuid === "c1");
    const c2 = get().favoritePodcasts.find((p) => p.uuid === "c2");
    expect(c1?.name).toBe("New name");
    expect(c1?.imageUrl).toBe("new-image");
    expect(c1?.coverArt).toBe("cover-2");
    expect(c1?.url).toBe("https://feed.example/new.xml");
    expect(c2?.name).toBe("Channel");
  });

  it("removeFavoritePodcast removes server favorites by channel id", () => {
    get().addFavoriteServerPodcast(makeChannel({ id: "c1" }), "scope-a");
    get().removeFavoritePodcast("c1");
    expect(get().favoritePodcasts).toEqual([]);
  });

  it("server favorites do not contribute to genre or language recommendations", () => {
    get().addFavoritePodcast(
      makePodcast({
        uuid: "taddy-1",
        genres: ["G1"] as any,
        language: "ENGLISH",
        itunesInfo: { country: "FRANCE" },
      }),
    );
    get().addFavoriteServerPodcast(makeChannel({ id: "c1" }), "scope-a");
    // Genre rotation only reflects the Taddy favorite's genre.
    expect(get().getTopGenres()).toEqual(["G1"]);
    const params = get().getRecommendationParams();
    expect(params.language).toBe("ENGLISH");
    expect(params.country).toBe("FRANCE");
    // Both favorites are excluded from recommendations by their id/uuid.
    expect(params.excludeUuids?.sort()).toEqual(["c1", "taddy-1"]);
  });
});

describe("podcasts store - episode progress", () => {
  const entry = (
    overrides: Partial<PodcastProgressEntry> = {},
  ): PodcastProgressEntry => ({
    id: "e1",
    source: "taddy",
    position: 100,
    updatedAt: 1,
    ...overrides,
  });

  it("setPodcastProgress upserts by id and hoists to the front", () => {
    get().setPodcastProgress(entry({ id: "a" }));
    get().setPodcastProgress(entry({ id: "b" }));
    get().setPodcastProgress(entry({ id: "a", position: 250 }));
    const progress = get().podcastProgress;
    expect(progress.map((e) => e.id)).toEqual(["a", "b"]);
    expect(progress[0].position).toBe(250);
  });

  it("setPodcastProgress caps the list at 50 entries, dropping the oldest", () => {
    for (let i = 0; i < 60; i++) {
      get().setPodcastProgress(entry({ id: `e${i}` }));
    }
    const progress = get().podcastProgress;
    expect(progress).toHaveLength(50);
    expect(progress[0].id).toBe("e59");
    expect(progress.some((e) => e.id === "e9")).toBe(false);
  });

  it("clearPodcastProgress drops the matching entry", () => {
    get().setPodcastProgress(entry({ id: "a" }));
    get().setPodcastProgress(entry({ id: "b" }));
    get().clearPodcastProgress("a");
    expect(get().podcastProgress.map((e) => e.id)).toEqual(["b"]);
  });

  it("clearPodcastProgress on an unknown id keeps the identical array reference", () => {
    get().setPodcastProgress(entry({ id: "a" }));
    const before = get().podcastProgress;
    get().clearPodcastProgress("nope");
    // Same reference, not merely equal: a fresh array would notify subscribers
    // and trigger a persist write on every non-podcast track finishing.
    expect(get().podcastProgress).toBe(before);
  });

  it("clearAllPodcastProgress empties the list", () => {
    get().setPodcastProgress(entry({ id: "a" }));
    get().clearAllPodcastProgress();
    expect(get().podcastProgress).toEqual([]);
  });

  it("podcastProgressForScope keeps taddy entries and scope-matching server ones", () => {
    const entries = [
      entry({ id: "taddy-1", source: "taddy" }),
      entry({ id: "srv-a", source: "server", scope: "scope-a" }),
      entry({ id: "srv-b", source: "server", scope: "scope-b" }),
    ];
    expect(
      podcastProgressForScope(entries, "scope-a").map((e) => e.id),
    ).toEqual(["taddy-1", "srv-a"]);
    // No active scope: only the server-independent Taddy entries survive.
    expect(
      podcastProgressForScope(entries, undefined).map((e) => e.id),
    ).toEqual(["taddy-1"]);
  });
});

describe("podcasts store - persistence migration", () => {
  it("migrates v0 favorites by backfilling source 'taddy'", async () => {
    const { zustandStorage } = require("@/config/storage");
    zustandStorage.setItem(
      "podcasts",
      JSON.stringify({
        version: 0,
        state: {
          favoritePodcasts: [
            {
              uuid: "legacy-1",
              name: "Legacy",
              imageUrl: "img",
              authorName: "Author",
              isFavorite: true,
              dateAdded: 1,
            },
          ],
        },
      }),
    );
    await usePodcastsBase.persist.rehydrate();
    const fav = get().favoritePodcasts.find((p) => p.uuid === "legacy-1");
    expect(fav?.source).toBe("taddy");
  });

  it("hydrates a v1 blob with no podcastProgress key to an empty list", async () => {
    const { zustandStorage } = require("@/config/storage");
    zustandStorage.setItem(
      "podcasts",
      JSON.stringify({
        version: 1,
        state: {
          favoritePodcasts: [
            {
              uuid: "existing-1",
              name: "Existing",
              imageUrl: "img",
              authorName: "Author",
              isFavorite: true,
              dateAdded: 1,
              source: "taddy",
            },
          ],
        },
      }),
    );
    await usePodcastsBase.persist.rehydrate();
    // The default shallow merge keeps the initializer's [] for the missing key,
    // so no version bump / migration is needed to introduce the field.
    expect(get().podcastProgress).toEqual([]);
    expect(get().favoritePodcasts.map((p) => p.uuid)).toEqual(["existing-1"]);
  });
});

describe("podcasts store - recommendations", () => {
  it("setLastUsedGenreIndex updates index", () => {
    get().setLastUsedGenreIndex(3);
    expect(get().lastUsedGenreIndex).toBe(3);
  });

  it("getGenreRotation returns default genres when no favorites", () => {
    expect(get().getGenreRotation()).toEqual([
      "PODCASTSERIES_NEWS_DAILY_NEWS",
      "PODCASTSERIES_COMEDY",
      "PODCASTSERIES_TECHNOLOGY",
      "PODCASTSERIES_SCIENCE",
      "PODCASTSERIES_HISTORY",
      "PODCASTSERIES_BUSINESS",
    ]);
  });

  it("getGenreRotation returns unique genres across favorites", () => {
    get().addFavoritePodcast(
      makePodcast({ uuid: "a", genres: ["G1", "G2"] as any }),
    );
    get().addFavoritePodcast(
      makePodcast({ uuid: "b", genres: ["G2", "G3"] as any }),
    );
    const rotation = get().getGenreRotation();
    expect(rotation.sort()).toEqual(["G1", "G2", "G3"]);
  });

  it("getRecommendationParams returns defaults when no favorites", () => {
    const params = get().getRecommendationParams();
    expect(params).toEqual({
      language: "ENGLISH",
      country: "UNITED_STATES_OF_AMERICA",
      excludeUuids: [],
      genres: [
        "PODCASTSERIES_NEWS_DAILY_NEWS",
        "PODCASTSERIES_COMEDY",
        "PODCASTSERIES_TECHNOLOGY",
        "PODCASTSERIES_SCIENCE",
        "PODCASTSERIES_HISTORY",
        "PODCASTSERIES_BUSINESS",
      ],
    });
  });

  it("getRecommendationParams excludes favorited uuids without mutating state", () => {
    get().addFavoritePodcast(makePodcast({ uuid: "a", genres: ["G1"] as any }));
    get().addFavoritePodcast(makePodcast({ uuid: "b", genres: ["G2"] as any }));
    const before = get().lastUsedGenreIndex;
    const params = get().getRecommendationParams();
    expect(params.excludeUuids?.sort()).toEqual(["a", "b"]);
    expect(params.genres).toHaveLength(2);
    expect(get().lastUsedGenreIndex).toBe(before);
  });

  it("advanceGenreRotation increments the rotation index", () => {
    get().addFavoritePodcast(makePodcast({ uuid: "a", genres: ["G1"] as any }));
    get().addFavoritePodcast(makePodcast({ uuid: "b", genres: ["G2"] as any }));
    const before = get().lastUsedGenreIndex;
    get().advanceGenreRotation();
    expect(get().lastUsedGenreIndex).not.toBe(before);
  });

  it("advanceGenreRotation wraps to 0 at the end of rotation", () => {
    get().addFavoritePodcast(makePodcast({ uuid: "a", genres: ["G1"] as any }));
    get().addFavoritePodcast(makePodcast({ uuid: "b", genres: ["G2"] as any }));
    // rotation length is 2 (G1, G2)
    get().setLastUsedGenreIndex(1);
    get().advanceGenreRotation();
    expect(get().lastUsedGenreIndex).toBe(0);
  });

  it("getTopGenres orders by frequency and respects the limit", () => {
    get().addFavoritePodcast(
      makePodcast({ uuid: "a", genres: ["G1", "G2"] as any }),
    );
    get().addFavoritePodcast(
      makePodcast({ uuid: "b", genres: ["G2", "G3"] as any }),
    );
    get().addFavoritePodcast(makePodcast({ uuid: "c", genres: ["G2"] as any }));
    const top3 = get().getTopGenres();
    expect(top3[0]).toBe("G2");
    expect(top3.slice(1).sort()).toEqual(["G1", "G3"]);
    expect(get().getTopGenres(1)).toEqual(["G2"]);
    expect(get().getTopGenres(2)[0]).toBe("G2");
    expect(get().getTopGenres(2)).toHaveLength(2);
  });

  it("getRecommendationParams picks the most common language and country", () => {
    get().addFavoritePodcast(
      makePodcast({
        uuid: "a",
        genres: ["G1"] as any,
        language: "ENGLISH",
        itunesInfo: { country: "FRANCE" },
      }),
    );
    get().addFavoritePodcast(
      makePodcast({
        uuid: "b",
        genres: ["G2"] as any,
        language: "FRENCH",
        itunesInfo: { country: "FRANCE" },
      }),
    );
    get().addFavoritePodcast(
      makePodcast({
        uuid: "c",
        genres: ["G3"] as any,
        language: "FRENCH",
        itunesInfo: { country: "UNITED_STATES_OF_AMERICA" },
      }),
    );
    const params = get().getRecommendationParams();
    expect(params.language).toBe("FRENCH");
    expect(params.country).toBe("FRANCE");
  });

  it("getRecommendationParams falls back to store defaults when favorites lack language/country", () => {
    get().addFavoritePodcast(
      makePodcast({
        uuid: "a",
        genres: ["G1"] as any,
        language: undefined,
        itunesInfo: undefined,
        country: undefined,
      }),
    );
    // wipe country fallback that addFavoritePodcast applied to keep counts empty
    usePodcastsBase.setState({
      favoritePodcasts: [
        {
          ...get().favoritePodcasts[0],
          language: undefined as any,
          country: undefined as any,
        },
      ],
    });
    const params = get().getRecommendationParams();
    expect(params.language).toBe("ENGLISH");
    expect(params.country).toBe("UNITED_STATES_OF_AMERICA");
  });
});
