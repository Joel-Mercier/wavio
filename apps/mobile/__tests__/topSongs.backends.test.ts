// The resolver picks id-vs-name; these assert the choice survives the trip to
// each backend's wire format. An empty `artist` is the trap: Subsonic servers
// without the `topSongsByArtistId` extension treat it as a real (unmatchable)
// name rather than an absent param, so the id path has to omit it outright.
const mockSubsonicRequest = jest.fn();
const mockJellyfinGet = jest.fn();
const mockQueryTopSongsByArtist = jest.fn();

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

jest.mock("@/services/openSubsonic", () => ({
  __esModule: true,
  default: {},
  subsonicRequest: (...args: unknown[]) => mockSubsonicRequest(...args),
}));

jest.mock("@/services/jellyfin", () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockJellyfinGet(...args) },
  getDeviceId: () => "device",
  userId: () => "user",
}));

jest.mock("@/services/local/repository", () => ({
  queryTopSongsByArtist: (...args: unknown[]) =>
    mockQueryTopSongsByArtist(...args),
}));

jest.mock("@/services/local/mappers", () => ({
  mapRowToChild: (row: { id: string }) => ({ id: row.id, title: row.id }),
}));

// The local backend reaches i18n for its "unknown artist" labels, and its zod
// locale imports are ESM-only.
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

jest.mock("@/services/jellyfin/mappers", () => ({
  mapBaseItemToChild: (item: { Id: string }) => ({
    id: item.Id,
    title: item.Id,
  }),
  COMMON_FIELDS: "",
}));

import { getTopSongs as jellyfinGetTopSongs } from "@/services/jellyfin/browsing";
import { getTopSongs as localGetTopSongs } from "@/services/local/browsing";
import { localArtistId } from "@/services/local/keys";
import { getTopSongs as subsonicGetTopSongs } from "@/services/openSubsonic/browsing";

beforeEach(() => {
  mockSubsonicRequest.mockReset();
  mockSubsonicRequest.mockResolvedValue({ topSongs: { song: [] } });
  mockJellyfinGet.mockReset();
  mockJellyfinGet.mockResolvedValue({ data: { Items: [] } });
  mockQueryTopSongsByArtist.mockReset();
  mockQueryTopSongsByArtist.mockResolvedValue([]);
});

describe("subsonic getTopSongs", () => {
  it("sends the artist name when called without an id", async () => {
    await subsonicGetTopSongs("Nirvana", { count: 10 });

    expect(mockSubsonicRequest).toHaveBeenCalledWith("/rest/getTopSongs", {
      artist: "Nirvana",
      count: 10,
      id: undefined,
    });
  });

  it("omits an empty artist so the id stands alone", async () => {
    await subsonicGetTopSongs("", { count: 10, id: "ar-1" });

    expect(mockSubsonicRequest).toHaveBeenCalledWith("/rest/getTopSongs", {
      artist: undefined,
      count: 10,
      id: "ar-1",
    });
  });
});

describe("jellyfin getTopSongs", () => {
  const config = () => mockJellyfinGet.mock.calls.at(-1)?.[1];
  const params = () => config()?.params;

  it("filters on ArtistIds when given an id", async () => {
    await jellyfinGetTopSongs("Nirvana", { count: 10, id: "ar-1" });

    expect(params()).toMatchObject({ ArtistIds: "ar-1" });
    // The fuzzy fallback would let other artists' tracks in.
    expect(params()).not.toHaveProperty("SearchTerm");
  });

  it("falls back to a SearchTerm when there is no id", async () => {
    await jellyfinGetTopSongs("Nirvana", { count: 10 });

    expect(params()).toMatchObject({ SearchTerm: "Nirvana" });
    expect(params()).not.toHaveProperty("ArtistIds");
  });

  it("treats a stale artist id as empty, not as an error to report", async () => {
    await jellyfinGetTopSongs("", { count: 10, id: "ar-1" });
    expect(config()?.notFoundIsExpected).toBe(true);

    // A 400 on the free-text form is a real request bug and must still surface.
    await jellyfinGetTopSongs("Nirvana", { count: 10 });
    expect(config()?.notFoundIsExpected).toBe(false);
  });
});

describe("local getTopSongs", () => {
  it("reads the artist key straight out of the id", async () => {
    await localGetTopSongs("", { count: 10, id: localArtistId("nirvana") });

    expect(mockQueryTopSongsByArtist).toHaveBeenCalledWith("nirvana", 10);
  });

  it("recovers the same key from the display name without an id", async () => {
    await localGetTopSongs("  Nirvana  ", { count: 10 });

    expect(mockQueryTopSongsByArtist).toHaveBeenCalledWith("nirvana", 10);
  });

  it("serves the untagged bucket for the empty artist key", async () => {
    // "" is a real key, which is why a foreign id must not degrade into it.
    await localGetTopSongs("", { count: 10, id: localArtistId("") });

    expect(mockQueryTopSongsByArtist).toHaveBeenCalledWith("", 10);
  });

  it("rejects an id that is not a local artist id", async () => {
    await expect(
      localGetTopSongs("Nirvana", { count: 10, id: "server-side-id" }),
    ).rejects.toThrow();

    expect(mockQueryTopSongsByArtist).not.toHaveBeenCalled();
  });
});
