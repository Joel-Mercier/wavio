jest.mock("@/services/lastFm/user", () => ({
  LOVED_TRACKS_PAGE_SIZE: 50,
  fetchLovedTracks: jest.fn(),
}));
jest.mock("@/services/libraryMatch", () => ({
  matchTracksToLibrary: jest.fn(),
}));
jest.mock("@/services/backend/mediaAnnotation", () => ({
  star: jest.fn(),
}));

import { star } from "@/services/backend/mediaAnnotation";
import {
  importLovedTracks,
  MAX_IMPORTED_LOVES,
} from "@/services/lastFm/lovedImport";
import { fetchLovedTracks } from "@/services/lastFm/user";
import { matchTracksToLibrary } from "@/services/libraryMatch";
import { AbortedError } from "@/utils/rateLimitedQueue";

const mockFetch = fetchLovedTracks as jest.Mock;
const mockMatch = matchTracksToLibrary as jest.Mock;
const mockStar = star as jest.Mock;

type Loved = { name: string; artist: string; mbid?: string };

const loved = (n: number): Loved[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `Track ${i}`,
    artist: `Artist ${i}`,
  }));

/** One page of `n` tracks, out of `total` across `totalPages`. */
const page = (items: Loved[], totalPages: number, total: number) => ({
  items,
  page: 1,
  totalPages,
  total,
});

const matched = (id: string, starred?: string) => ({
  state: "matched" as const,
  external: { key: id, title: "t", artist: "a" },
  track: { id, starred },
  confidence: 0.9,
});
const missing = (key: string) => ({
  state: "missing" as const,
  external: { key, title: "t", artist: "a" },
});

beforeEach(() => {
  mockFetch.mockReset();
  mockMatch.mockReset();
  mockStar.mockReset();
  mockStar.mockResolvedValue(undefined);
  mockMatch.mockResolvedValue([]);
});

describe("importLovedTracks", () => {
  it("stars every match that isn't already a favourite", async () => {
    mockFetch.mockResolvedValue(page(loved(3), 1, 3));
    mockMatch.mockResolvedValue([
      matched("song-1"),
      matched("song-2", "2026-01-01T00:00:00Z"),
      missing("2"),
    ]);

    const result = await importLovedTracks({ userName: "someone" });

    expect(mockStar).toHaveBeenCalledTimes(1);
    expect(mockStar).toHaveBeenCalledWith({ id: "song-1" });
    expect(result).toEqual({
      fetched: 3,
      matched: 2,
      starred: 1,
      failed: 0,
      truncated: false,
    });
  });

  it("passes the loved track's name, artist and mbid to the resolver", async () => {
    mockFetch.mockResolvedValue(
      page([{ name: "Alive", artist: "Pearl Jam", mbid: "mbid-1" }], 1, 1),
    );

    await importLovedTracks({
      userName: "someone",
      musicFolderId: "folder-2",
      multiFieldSearch: false,
    });

    expect(mockMatch).toHaveBeenCalledWith(
      [
        {
          key: "0",
          title: "Alive",
          artist: "Pearl Jam",
          recordingMbid: "mbid-1",
        },
      ],
      expect.objectContaining({
        musicFolderId: "folder-2",
        multiFieldSearch: false,
      }),
    );
  });

  it("pages until the last page", async () => {
    mockFetch
      .mockResolvedValueOnce(page(loved(50), 3, 120))
      .mockResolvedValueOnce(page(loved(50), 3, 120))
      .mockResolvedValueOnce(page(loved(20), 3, 120));

    const result = await importLovedTracks({ userName: "someone" });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls.map((call) => call[0].page)).toEqual([1, 2, 3]);
    expect(result.fetched).toBe(120);
    expect(result.truncated).toBe(false);
  });

  it("stops at the cap and says so", async () => {
    const pages = Math.ceil(MAX_IMPORTED_LOVES / 50);
    mockFetch.mockResolvedValue(
      page(loved(50), pages + 5, MAX_IMPORTED_LOVES + 250),
    );

    const result = await importLovedTracks({ userName: "someone" });

    expect(mockFetch).toHaveBeenCalledTimes(pages);
    expect(result.fetched).toBe(MAX_IMPORTED_LOVES);
    expect(result.truncated).toBe(true);
  });

  it("counts a failed star without aborting the rest", async () => {
    mockFetch.mockResolvedValue(page(loved(3), 1, 3));
    mockMatch.mockResolvedValue([
      matched("song-1"),
      matched("song-2"),
      matched("song-3"),
    ]);
    mockStar.mockImplementation(({ id }: { id: string }) =>
      id === "song-2" ? Promise.reject(new Error("nope")) : Promise.resolve(),
    );

    const result = await importLovedTracks({ userName: "someone" });

    expect(mockStar).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ starred: 2, failed: 1 });
  });

  it("does nothing when the account has no loves", async () => {
    mockFetch.mockResolvedValue(page([], 1, 0));

    const result = await importLovedTracks({ userName: "someone" });

    expect(mockMatch).not.toHaveBeenCalled();
    expect(mockStar).not.toHaveBeenCalled();
    expect(result).toEqual({
      fetched: 0,
      matched: 0,
      starred: 0,
      failed: 0,
      truncated: false,
    });
  });

  it("reports progress through each phase", async () => {
    mockFetch.mockResolvedValue(page(loved(2), 1, 2));
    mockMatch.mockResolvedValue([matched("song-1"), missing("1")]);
    const progress: unknown[] = [];

    await importLovedTracks({
      userName: "someone",
      onProgress: (update) => progress.push(update),
    });

    expect(progress).toEqual([
      { phase: "fetching", done: 2, total: 2 },
      { phase: "matching", done: 0, total: 2 },
      { phase: "starring", done: 0, total: 1 },
      { phase: "starring", done: 1, total: 1 },
    ]);
  });

  it("aborts before the first request when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      importLovedTracks({ userName: "someone", signal: controller.signal }),
    ).rejects.toBeInstanceOf(AbortedError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("stops paging once the signal is aborted", async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation(() => {
      controller.abort();
      return Promise.resolve(page(loved(50), 5, 250));
    });

    await expect(
      importLovedTracks({ userName: "someone", signal: controller.signal }),
    ).rejects.toBeInstanceOf(AbortedError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
