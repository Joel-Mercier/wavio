// A large add has to survive the URL budget: `songIdToAdd` is serialized as one
// repeated query param per id on a GET, so a few hundred ids blow past the 8 KB
// request line most reverse proxies allow and the whole call comes back 414.
const mockSubsonicRequest = jest.fn();

jest.mock("@/services/openSubsonic", () => ({
  __esModule: true,
  default: {},
  subsonicRequest: (...args: unknown[]) => mockSubsonicRequest(...args),
}));

import { updatePlaylist } from "@/services/openSubsonic/playlists";

const CHUNK_SIZE = 100;
const ids = (count: number) =>
  Array.from({ length: count }, (_, i) => `id-${i}`);

type Params = {
  playlistId: string;
  name?: string;
  comment?: string;
  public?: boolean;
  songIdToAdd?: string[];
  songIndexToRemove?: string[];
};

const paramsOf = (call: number): Params =>
  mockSubsonicRequest.mock.calls[call][1] as Params;

describe("openSubsonic updatePlaylist chunking", () => {
  beforeEach(() => {
    mockSubsonicRequest.mockReset();
    mockSubsonicRequest.mockResolvedValue({ status: "ok" });
  });

  it("sends a single request when the add fits in one chunk", async () => {
    await updatePlaylist("p1", { songIdToAdd: ids(CHUNK_SIZE) });
    expect(mockSubsonicRequest).toHaveBeenCalledTimes(1);
    expect(paramsOf(0).songIdToAdd).toHaveLength(CHUNK_SIZE);
  });

  it("splits a large add across requests, preserving order", async () => {
    await updatePlaylist("p1", { songIdToAdd: ids(CHUNK_SIZE * 2 + 5) });

    expect(mockSubsonicRequest).toHaveBeenCalledTimes(3);
    expect(paramsOf(0).songIdToAdd).toHaveLength(CHUNK_SIZE);
    expect(paramsOf(1).songIdToAdd).toHaveLength(CHUNK_SIZE);
    expect(paramsOf(2).songIdToAdd).toHaveLength(5);

    const sent = [0, 1, 2].flatMap((call) => paramsOf(call).songIdToAdd ?? []);
    expect(sent).toEqual(ids(CHUNK_SIZE * 2 + 5));
  });

  it("carries metadata and removals on the first request only", async () => {
    await updatePlaylist("p1", {
      name: "Renamed",
      comment: "Note",
      isPublic: true,
      songIdToAdd: ids(CHUNK_SIZE + 1),
      songIndexToRemove: ["3", "2"],
    });

    expect(paramsOf(0)).toMatchObject({
      playlistId: "p1",
      name: "Renamed",
      comment: "Note",
      public: true,
      songIndexToRemove: ["3", "2"],
    });
    expect(paramsOf(1)).toEqual({
      playlistId: "p1",
      songIdToAdd: [`id-${CHUNK_SIZE}`],
    });
  });

  it("never splits songIndexToRemove — the indices shift as they are applied", async () => {
    const indices = Array.from({ length: CHUNK_SIZE * 3 }, (_, i) => String(i));
    await updatePlaylist("p1", { songIndexToRemove: indices });

    expect(mockSubsonicRequest).toHaveBeenCalledTimes(1);
    expect(paramsOf(0).songIndexToRemove).toEqual(indices);
  });

  it("still issues one request for a metadata-only update", async () => {
    await updatePlaylist("p1", { name: "Renamed" });
    expect(mockSubsonicRequest).toHaveBeenCalledTimes(1);
    expect(paramsOf(0).songIdToAdd).toBeUndefined();
  });

  it("stops at the failing chunk, leaving the earlier ones added", async () => {
    mockSubsonicRequest
      .mockResolvedValueOnce({ status: "ok" })
      .mockRejectedValueOnce(new Error("boom"));

    await expect(
      updatePlaylist("p1", { songIdToAdd: ids(CHUNK_SIZE * 3) }),
    ).rejects.toThrow("boom");
    expect(mockSubsonicRequest).toHaveBeenCalledTimes(2);
  });
});
