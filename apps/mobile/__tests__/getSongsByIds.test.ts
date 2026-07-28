// AudioMuse-AI answers with a *ranked* list of bare item ids, so hydration has
// to give the caller its ranking back — none of the three backends returns rows
// in the order they were asked for. Ids the library no longer knows are dropped
// rather than failing the batch: the index that produced them can lag a scan.
const mockSubsonicRequest = jest.fn();
const mockJellyfinGet = jest.fn();
const mockQueryTracksByIds = jest.fn();

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
  queryTracksByIds: (...args: unknown[]) => mockQueryTracksByIds(...args),
}));

jest.mock("@/services/local/mappers", () => ({
  mapRowToChild: (row: { id: string }) => ({ id: row.id, title: row.id }),
}));

// The local backend reaches i18n for its "unknown album" labels, and its zod
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

import { getSongsByIds as jellyfinGetSongsByIds } from "@/services/jellyfin/browsing";
import { getSongsByIds as localGetSongsByIds } from "@/services/local/browsing";
import { getSongsByIds as subsonicGetSongsByIds } from "@/services/openSubsonic/browsing";

beforeEach(() => {
  mockSubsonicRequest.mockReset();
  mockJellyfinGet.mockReset();
  mockQueryTracksByIds.mockReset();
});

describe.each([
  [
    "subsonic",
    subsonicGetSongsByIds,
    (known: string[]) => {
      mockSubsonicRequest.mockImplementation(
        async (_path: string, params: { id: string }) => {
          if (!known.includes(params.id)) throw new Error("not found");
          return { song: { id: params.id, title: params.id } };
        },
      );
    },
  ],
  [
    "jellyfin",
    jellyfinGetSongsByIds,
    (known: string[]) => {
      mockJellyfinGet.mockImplementation(async () => ({
        // Jellyfin answers in its own order, never the requested one.
        data: { Items: [...known].reverse().map((id) => ({ Id: id })) },
      }));
    },
  ],
  [
    "local",
    localGetSongsByIds,
    (known: string[]) => {
      mockQueryTracksByIds.mockImplementation(async () =>
        [...known].reverse().map((id) => ({ id })),
      );
    },
  ],
])("%s getSongsByIds", (_name, getSongsByIds, seed) => {
  it("returns the songs in the requested order", async () => {
    seed(["c", "a", "b"]);

    const songs = await getSongsByIds(["c", "a", "b"]);

    expect(songs.map((song) => song.id)).toEqual(["c", "a", "b"]);
  });

  it("drops ids the library no longer knows", async () => {
    seed(["a", "c"]);

    const songs = await getSongsByIds(["a", "gone", "c"]);

    expect(songs.map((song) => song.id)).toEqual(["a", "c"]);
  });

  it("does not call out for an empty list", async () => {
    seed([]);

    await expect(getSongsByIds([])).resolves.toEqual([]);
    expect(mockSubsonicRequest).not.toHaveBeenCalled();
    expect(mockJellyfinGet).not.toHaveBeenCalled();
    expect(mockQueryTracksByIds).not.toHaveBeenCalled();
  });
});
