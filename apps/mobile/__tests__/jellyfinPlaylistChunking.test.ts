// Jellyfin takes item ids comma-joined on the query string (`Ids` / `EntryIds`),
// not in a body, so a few hundred 32-char ids run past the 8 KB request line most
// reverse proxies allow and the whole call comes back 414.
const mockPost = jest.fn();
const mockGet = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/services/jellyfin", () => ({
  __esModule: true,
  default: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  getDeviceId: () => "device",
}));

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ jellyfinUserId: "user" }) },
}));

import { updatePlaylist } from "@/services/jellyfin/playlists";

const CHUNK_SIZE = 100;
const ids = (count: number) =>
  Array.from({ length: count }, (_, i) => `id-${i}`);

const sentIds = (call: number): string[] =>
  (mockPost.mock.calls[call][2].params.Ids as string).split(",");

describe("jellyfin updatePlaylist chunking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPost.mockResolvedValue({ data: {} });
    mockDelete.mockResolvedValue({ data: {} });
    mockGet.mockResolvedValue({ data: { Items: [] } });
  });

  it("sends a single request when the add fits in one chunk", async () => {
    await updatePlaylist("p1", { songIdToAdd: ids(CHUNK_SIZE) });
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(sentIds(0)).toHaveLength(CHUNK_SIZE);
  });

  it("splits a large add across requests, preserving order", async () => {
    await updatePlaylist("p1", { songIdToAdd: ids(CHUNK_SIZE * 2 + 5) });

    expect(mockPost).toHaveBeenCalledTimes(3);
    expect(sentIds(0)).toHaveLength(CHUNK_SIZE);
    expect(sentIds(1)).toHaveLength(CHUNK_SIZE);
    expect(sentIds(2)).toHaveLength(5);
    expect([0, 1, 2].flatMap(sentIds)).toEqual(ids(CHUNK_SIZE * 2 + 5));
  });

  it("issues no add request at all when there is nothing to add", async () => {
    await updatePlaylist("p1", { songIdToAdd: [] });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("still applies name and visibility in their own request", async () => {
    await updatePlaylist("p1", { name: "Renamed", isPublic: true });
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/Playlists/p1", {
      Name: "Renamed",
      IsPublic: true,
    });
  });

  it("splits the entry-id removal too, translating indices once", async () => {
    const count = CHUNK_SIZE * 2 + 3;
    mockGet.mockResolvedValue({
      data: {
        Items: Array.from({ length: count }, (_, i) => ({
          Id: `item-${i}`,
          PlaylistItemId: `entry-${i}`,
        })),
      },
    });

    await updatePlaylist("p1", {
      songIndexToRemove: Array.from({ length: count }, (_, i) => String(i)),
    });

    // One lookup for the whole batch, then chunked deletes.
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledTimes(3);

    const deleted = mockDelete.mock.calls.flatMap((call) =>
      (call[1].params.EntryIds as string).split(","),
    );
    expect(deleted).toEqual(
      Array.from({ length: count }, (_, i) => `entry-${i}`),
    );
  });

  it("stops at the failing chunk, leaving the earlier ones added", async () => {
    mockPost
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce(new Error("boom"));

    await expect(
      updatePlaylist("p1", { songIdToAdd: ids(CHUNK_SIZE * 3) }),
    ).rejects.toThrow("boom");
    expect(mockPost).toHaveBeenCalledTimes(2);
  });
});
