import {
  chunk,
  createSnapshot,
  refreshSnapshot,
  SNAPSHOT_CHUNK_SIZE,
} from "@/services/playlistSnapshot";

const mockCreatePlaylist = jest.fn();
const mockUpdatePlaylist = jest.fn();
const mockGetPlaylist = jest.fn();

jest.mock("@/services/backend/playlists", () => ({
  createPlaylist: (...args: unknown[]) => mockCreatePlaylist(...args),
  updatePlaylist: (...args: unknown[]) => mockUpdatePlaylist(...args),
  getPlaylist: (...args: unknown[]) => mockGetPlaylist(...args),
}));

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);

beforeEach(() => {
  jest.clearAllMocks();
  mockCreatePlaylist.mockResolvedValue({ playlist: { id: "snap" } });
  mockUpdatePlaylist.mockResolvedValue({});
  mockGetPlaylist.mockResolvedValue({ playlist: { entry: [] } });
});

describe("chunk", () => {
  it("splits at the chunk size and keeps order", () => {
    expect(chunk(["a", "b", "c"], 2)).toEqual([["a", "b"], ["c"]]);
  });

  it("returns nothing for an empty list", () => {
    expect(chunk([], 2)).toEqual([]);
  });
});

describe("createSnapshot", () => {
  it("creates the playlist with the first chunk and appends the rest", async () => {
    const id = await createSnapshot("Snap", ids(SNAPSHOT_CHUNK_SIZE * 2 + 1));

    expect(id).toBe("snap");
    expect(mockCreatePlaylist).toHaveBeenCalledTimes(1);
    expect(mockCreatePlaylist.mock.calls[0][1]).toHaveLength(
      SNAPSHOT_CHUNK_SIZE,
    );
    expect(mockUpdatePlaylist).toHaveBeenCalledTimes(2);
    expect(mockUpdatePlaylist.mock.calls[0][1].songIdToAdd).toHaveLength(
      SNAPSHOT_CHUNK_SIZE,
    );
    expect(mockUpdatePlaylist.mock.calls[1][1].songIdToAdd).toHaveLength(1);
  });

  it("needs no follow-up request at exactly one chunk", async () => {
    await createSnapshot("Snap", ids(SNAPSHOT_CHUNK_SIZE));
    expect(mockUpdatePlaylist).not.toHaveBeenCalled();
  });

  it("creates an empty playlist rather than sending undefined", async () => {
    await createSnapshot("Snap", []);
    expect(mockCreatePlaylist).toHaveBeenCalledWith("Snap", []);
  });

  it("fails loudly when the backend returns no id", async () => {
    mockCreatePlaylist.mockResolvedValue({ playlist: undefined });
    await expect(createSnapshot("Snap", ids(1))).rejects.toThrow();
  });

  it("sends every id exactly once, in order", async () => {
    const all = ids(250);
    await createSnapshot("Snap", all);
    const sent = [
      ...mockCreatePlaylist.mock.calls[0][1],
      ...mockUpdatePlaylist.mock.calls.flatMap((c) => c[1].songIdToAdd),
    ];
    expect(sent).toEqual(all);
  });
});

describe("refreshSnapshot", () => {
  // Indices shift as tracks leave, so ascending removal would delete the wrong
  // rows from the second chunk onwards.
  it("removes existing entries by descending index", async () => {
    mockGetPlaylist.mockResolvedValue({
      playlist: { entry: ids(3).map((id) => ({ id })) },
    });

    await refreshSnapshot("snap", []);

    expect(mockUpdatePlaylist).toHaveBeenCalledTimes(1);
    expect(mockUpdatePlaylist.mock.calls[0][1].songIndexToRemove).toEqual([
      "2",
      "1",
      "0",
    ]);
  });

  it("chunks a long removal into descending blocks", async () => {
    const count = SNAPSHOT_CHUNK_SIZE + 5;
    mockGetPlaylist.mockResolvedValue({
      playlist: { entry: ids(count).map((id) => ({ id })) },
    });

    await refreshSnapshot("snap", []);

    const removals = mockUpdatePlaylist.mock.calls.map(
      (c) => c[1].songIndexToRemove,
    );
    expect(removals).toHaveLength(2);
    expect(removals[0][0]).toBe(String(count - 1));
    expect(removals[1]).toEqual(["4", "3", "2", "1", "0"]);
  });

  // A failure between the two passes must not be able to empty the copy, so the
  // new tracks land before the old ones leave.
  it("adds before it removes, and keeps the same playlist id", async () => {
    mockGetPlaylist.mockResolvedValue({ playlist: { entry: [{ id: "old" }] } });

    await refreshSnapshot("snap", ["new"]);

    expect(mockUpdatePlaylist.mock.calls.map((c) => c[0])).toEqual([
      "snap",
      "snap",
    ]);
    expect(mockUpdatePlaylist.mock.calls[0][1]).toEqual({
      songIdToAdd: ["new"],
    });
    expect(mockUpdatePlaylist.mock.calls[1][1]).toEqual({
      songIndexToRemove: ["0"],
    });
  });

  // The additions append, so the entries being replaced keep the indices they
  // had before the add pass ran.
  it("removes the pre-existing indices, not the appended ones", async () => {
    mockGetPlaylist.mockResolvedValue({
      playlist: { entry: ids(2).map((id) => ({ id })) },
    });

    await refreshSnapshot("snap", ["a", "b", "c"]);

    const removals = mockUpdatePlaylist.mock.calls
      .map((c) => c[1].songIndexToRemove)
      .filter(Boolean);
    expect(removals).toEqual([["1", "0"]]);
  });

  it("leaves the copy untouched when the add pass fails", async () => {
    mockGetPlaylist.mockResolvedValue({ playlist: { entry: [{ id: "old" }] } });
    mockUpdatePlaylist.mockRejectedValue(new Error("network"));

    await expect(refreshSnapshot("snap", ["new"])).rejects.toThrow();

    expect(mockUpdatePlaylist).toHaveBeenCalledTimes(1);
    expect(mockUpdatePlaylist.mock.calls[0][1]).toEqual({
      songIdToAdd: ["new"],
    });
  });

  it("skips the removal pass on an already empty snapshot", async () => {
    await refreshSnapshot("snap", ["a"]);
    expect(mockUpdatePlaylist).toHaveBeenCalledTimes(1);
    expect(mockUpdatePlaylist.mock.calls[0][1]).toEqual({ songIdToAdd: ["a"] });
  });
});
