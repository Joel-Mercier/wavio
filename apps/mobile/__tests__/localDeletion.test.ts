// Deleting a track from an index-backed library: the file goes through the
// file source, the row leaves the index without a rescan, and a lyrics sidecar
// goes too unless another track still reads it.

const mockRows = new Map<
  string,
  { id: string; uri: string; lyrics_sidecar: string | null }
>();
const mockDb = {
  getFirstAsync: jest.fn(async (sql: string, value: string) => {
    if (sql.includes("WHERE id = ?")) return mockRows.get(value) ?? null;
    for (const row of mockRows.values()) {
      if (row.lyrics_sidecar === value) return { id: row.id };
    }
    return null;
  }),
};
jest.mock("@/services/local/db", () => ({
  getLocalLibraryDb: async () => mockDb,
}));

const mockDeleteTracksByIds = jest.fn(async (_db: unknown, ids: string[]) => {
  for (const id of ids) mockRows.delete(id);
});
jest.mock("@/services/local/indexer", () => ({
  deleteTracksByIds: (db: unknown, ids: string[]) =>
    mockDeleteTracksByIds(db, ids),
}));

const mockSource = { kind: "webdav", delete: jest.fn() };
jest.mock("@/services/fileSource", () => ({
  activeFileSource: () => mockSource,
}));

const mockUnstar = jest.fn();
jest.mock("@/stores/localLibrary", () => ({
  __esModule: true,
  default: { getState: () => ({ unstar: mockUnstar }) },
}));

jest.mock("@/utils/log", () => ({ logError: jest.fn() }));

import { FileSourceError } from "@/services/fileSource/errors";
import { deleteConcurrency, deleteTrack } from "@/services/local/deletion";

const row = (id: string, lyrics: string | null = null) =>
  mockRows.set(id, {
    id,
    uri: `webdav:/Album/${id}.flac`,
    lyrics_sidecar: lyrics,
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockRows.clear();
  mockSource.kind = "webdav";
  mockSource.delete.mockResolvedValue(undefined);
});

describe("local deleteTrack", () => {
  it("deletes the file, then the index row and the favourite", async () => {
    row("a");
    await deleteTrack("a");
    expect(mockSource.delete).toHaveBeenCalledWith("webdav:/Album/a.flac");
    expect(mockDeleteTracksByIds).toHaveBeenCalledWith(mockDb, ["a"]);
    expect(mockUnstar).toHaveBeenCalledWith({ id: "a" });
  });

  it("leaves the index alone when the file couldn't be deleted", async () => {
    row("a");
    mockSource.delete.mockRejectedValue(
      new FileSourceError("ERR_FS_READ_ONLY", "nope"),
    );
    await expect(deleteTrack("a")).rejects.toMatchObject({
      code: "ERR_FS_READ_ONLY",
    });
    expect(mockDeleteTracksByIds).not.toHaveBeenCalled();
  });

  it("is a no-op for a track the index no longer has", async () => {
    await deleteTrack("gone");
    expect(mockSource.delete).not.toHaveBeenCalled();
  });

  it("deletes a lyrics sidecar nothing else uses", async () => {
    row("a", "webdav:/Album/a.lrc");
    await deleteTrack("a");
    expect(mockSource.delete).toHaveBeenCalledWith("webdav:/Album/a.lrc");
  });

  it("keeps a sidecar another track still reads", async () => {
    row("a", "webdav:/Album/Song.lrc");
    row("b", "webdav:/Album/Song.lrc");
    await deleteTrack("a");
    expect(mockSource.delete).toHaveBeenCalledTimes(1);
  });

  it("doesn't fail the delete over a sidecar", async () => {
    row("a", "webdav:/Album/a.lrc");
    mockSource.delete
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("locked"));
    await expect(deleteTrack("a")).resolves.toBeUndefined();
  });

  it("deletes device files one at a time", () => {
    mockSource.kind = "device";
    expect(deleteConcurrency()).toBe(1);
    mockSource.kind = "smb";
    expect(deleteConcurrency()).toBe(4);
  });
});
