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

import useRadioStations, {
  type AddFavoriteRadioStationInput,
} from "@/stores/radioStations";

const get = () => useRadioStations.getState();

const make = (
  id: string,
  overrides: Partial<AddFavoriteRadioStationInput> = {},
): AddFavoriteRadioStationInput => ({
  id,
  name: `station-${id}`,
  streamUrl: `https://stream/${id}`,
  source: "radioBrowser",
  ...overrides,
});

beforeEach(() => {
  useRadioStations.setState({ favoriteRadioStations: [] }, false);
});

describe("radioStations store - addFavoriteRadioStation", () => {
  it("prepends new stations", () => {
    get().addFavoriteRadioStation(make("a"));
    get().addFavoriteRadioStation(make("b"));
    expect(get().favoriteRadioStations.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("marks added stations as favorite and stamps dateAdded", () => {
    const now = 1_700_000_000_000;
    const spy = jest.spyOn(Date, "now").mockReturnValue(now);
    get().addFavoriteRadioStation(make("a"));
    const station = get().favoriteRadioStations[0];
    expect(station.isFavorite).toBe(true);
    expect(station.dateAdded).toBe(now);
    spy.mockRestore();
  });

  it("preserves all passed input fields", () => {
    get().addFavoriteRadioStation(
      make("a", {
        homePageUrl: "https://home",
        imageUrl: "https://img",
        tags: "jazz,blues",
        country: "France",
        countrySubdivision: "Île-de-France",
        languages: "french",
        source: "server",
        scope: "scope-1",
      }),
    );
    expect(get().favoriteRadioStations[0]).toMatchObject({
      id: "a",
      name: "station-a",
      streamUrl: "https://stream/a",
      homePageUrl: "https://home",
      imageUrl: "https://img",
      tags: "jazz,blues",
      country: "France",
      countrySubdivision: "Île-de-France",
      languages: "french",
      source: "server",
      scope: "scope-1",
    });
  });

  it("ignores stations whose id is already present", () => {
    get().addFavoriteRadioStation(make("a", { name: "first" }));
    get().addFavoriteRadioStation(make("a", { name: "second" }));
    expect(get().favoriteRadioStations).toHaveLength(1);
    // The original entry is kept, the duplicate is dropped.
    expect(get().favoriteRadioStations[0].name).toBe("first");
  });
});

describe("radioStations store - removeFavoriteRadioStation", () => {
  it("removes the station matching the id", () => {
    get().addFavoriteRadioStation(make("a"));
    get().addFavoriteRadioStation(make("b"));
    get().removeFavoriteRadioStation("a");
    expect(get().favoriteRadioStations.map((s) => s.id)).toEqual(["b"]);
  });

  it("is a no-op when the id is not present", () => {
    get().addFavoriteRadioStation(make("a"));
    get().removeFavoriteRadioStation("missing");
    expect(get().favoriteRadioStations.map((s) => s.id)).toEqual(["a"]);
  });
});

describe("radioStations store - updateFavoriteRadioStation", () => {
  it("merges the patch into the matching station", () => {
    get().addFavoriteRadioStation(make("a", { name: "old" }));
    get().updateFavoriteRadioStation("a", {
      name: "new",
      imageUrl: "https://img",
    });
    const station = get().favoriteRadioStations[0];
    expect(station.name).toBe("new");
    expect(station.imageUrl).toBe("https://img");
    // Untouched fields remain intact.
    expect(station.streamUrl).toBe("https://stream/a");
  });

  it("only updates the targeted station", () => {
    get().addFavoriteRadioStation(make("a"));
    get().addFavoriteRadioStation(make("b"));
    get().updateFavoriteRadioStation("a", { name: "renamed" });
    expect(get().favoriteRadioStations.find((s) => s.id === "b")?.name).toBe(
      "station-b",
    );
  });

  it("is a no-op when the id does not exist", () => {
    get().addFavoriteRadioStation(make("a"));
    get().updateFavoriteRadioStation("missing", { name: "x" });
    expect(get().favoriteRadioStations[0].name).toBe("station-a");
  });
});

describe("radioStations store - clearFavoriteRadioStations", () => {
  it("removes every favorite", () => {
    get().addFavoriteRadioStation(make("a"));
    get().addFavoriteRadioStation(make("b", { source: "server" }));
    get().clearFavoriteRadioStations();
    expect(get().favoriteRadioStations).toEqual([]);
  });
});
