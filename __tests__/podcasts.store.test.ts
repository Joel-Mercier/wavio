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

import { usePodcastsBase } from "@/stores/podcasts";

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

beforeEach(() => {
  usePodcastsBase.setState(
    {
      taddyPodcastsApiKey: "",
      taddyPodcastsUserId: "",
      taddyPodcastsLanguage: "ENGLISH",
      taddyPodcastsCountry: "UNITED_STATES_OF_AMERICA",
      favoritePodcasts: [],
      lastUsedGenreIndex: 0,
    },
    false,
  );
});

describe("podcasts store - config", () => {
  it("setTaddyPodcastsConfig updates all fields", () => {
    get().setTaddyPodcastsConfig({
      apiKey: "k",
      userId: "u",
      language: "FRENCH" as any,
      country: "FRANCE" as any,
    });
    const s = get();
    expect(s.taddyPodcastsApiKey).toBe("k");
    expect(s.taddyPodcastsUserId).toBe("u");
    expect(s.taddyPodcastsLanguage).toBe("FRENCH");
    expect(s.taddyPodcastsCountry).toBe("FRANCE");
  });

  it("clearTaddyPodcastsConfig clears apiKey and userId", () => {
    get().setTaddyPodcastsConfig({
      apiKey: "k",
      userId: "u",
      language: "ENGLISH" as any,
      country: "UNITED_STATES_OF_AMERICA" as any,
    });
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
