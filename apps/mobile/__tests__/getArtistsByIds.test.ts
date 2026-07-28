// The artist counterpart of getSongsByIds, hydrating AudioMuse's ranked artist
// results. Same two guarantees — the caller's ranking survives, and ids the
// library no longer knows drop out instead of failing the batch — plus one of
// its own: getArtist answers with the artist's whole discography, which must not
// ride along into a carousel or the persisted query cache.
const mockSubsonicRequest = jest.fn();
const mockJellyfinGet = jest.fn();
const mockQueryArtistByKey = jest.fn();

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
  queryArtistByKey: (...args: unknown[]) => mockQueryArtistByKey(...args),
}));

jest.mock("@/services/local/mappers", () => ({
  mapAggToArtist: (row: { artist_key: string }) => ({
    id: row.artist_key,
    name: row.artist_key,
    albumCount: 1,
  }),
}));

// The local backend reaches i18n for its "unknown artist" labels, and its zod
// locale imports are ESM-only.
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

jest.mock("@/services/local/keys", () => ({
  parseLocalArtistId: (id: string) => id,
}));

jest.mock("@/services/jellyfin/mappers", () => ({
  mapBaseItemToArtist: (item: { Id: string }) => ({
    id: item.Id,
    name: item.Id,
    albumCount: 1,
  }),
  COMMON_FIELDS: "",
}));

import { getArtistsByIds as jellyfinGetArtistsByIds } from "@/services/jellyfin/browsing";
import { getArtistsByIds as localGetArtistsByIds } from "@/services/local/browsing";
import { getArtistsByIds as subsonicGetArtistsByIds } from "@/services/openSubsonic/browsing";

beforeEach(() => {
  mockSubsonicRequest.mockReset();
  mockJellyfinGet.mockReset();
  mockQueryArtistByKey.mockReset();
});

describe.each([
  [
    "subsonic",
    subsonicGetArtistsByIds,
    (known: string[]) => {
      mockSubsonicRequest.mockImplementation(
        async (_path: string, params: { id: string }) => {
          if (!known.includes(params.id)) throw new Error("not found");
          return {
            artist: {
              id: params.id,
              name: params.id,
              albumCount: 1,
              album: [{ id: `${params.id}-album` }],
            },
          };
        },
      );
    },
  ],
  [
    "jellyfin",
    jellyfinGetArtistsByIds,
    (known: string[]) => {
      mockJellyfinGet.mockImplementation(async () => ({
        // Jellyfin answers in its own order, never the requested one.
        data: { Items: [...known].reverse().map((id) => ({ Id: id })) },
      }));
    },
  ],
  [
    "local",
    localGetArtistsByIds,
    (known: string[]) => {
      mockQueryArtistByKey.mockImplementation(async (key: string) =>
        known.includes(key) ? { artist_key: key } : null,
      );
    },
  ],
])("%s getArtistsByIds", (_name, getArtistsByIds, seed) => {
  it("returns the artists in the requested order", async () => {
    seed(["c", "a", "b"]);

    const artists = await getArtistsByIds(["c", "a", "b"]);

    expect(artists.map((artist) => artist.id)).toEqual(["c", "a", "b"]);
  });

  it("drops ids the library no longer knows", async () => {
    seed(["a", "c"]);

    const artists = await getArtistsByIds(["a", "gone", "c"]);

    expect(artists.map((artist) => artist.id)).toEqual(["a", "c"]);
  });

  it("does not call out for an empty list", async () => {
    seed([]);

    await expect(getArtistsByIds([])).resolves.toEqual([]);
    expect(mockSubsonicRequest).not.toHaveBeenCalled();
    expect(mockJellyfinGet).not.toHaveBeenCalled();
    expect(mockQueryArtistByKey).not.toHaveBeenCalled();
  });
});

// Only Subsonic has a discography to shed: /rest/getArtist is the sole lookup it
// offers, and it always bundles the albums.
describe("subsonic getArtistsByIds", () => {
  it("drops the discography getArtist bundles in", async () => {
    mockSubsonicRequest.mockResolvedValue({
      artist: {
        id: "a",
        name: "A",
        albumCount: 2,
        album: [{ id: "al-1" }, { id: "al-2" }],
      },
    });

    const artists = await subsonicGetArtistsByIds(["a"]);

    expect(artists).toEqual([{ id: "a", name: "A", albumCount: 2 }]);
  });
});
