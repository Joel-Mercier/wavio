const mockCreateSnapshot = jest.fn();
const mockCreateAudioMusePlaylist = jest.fn();

jest.mock("@/services/playlistSnapshot", () => ({
  createSnapshot: (...args: unknown[]) => mockCreateSnapshot(...args),
}));

jest.mock("@/services/audioMuse/playlists", () => ({
  createAudioMusePlaylist: (...args: unknown[]) =>
    mockCreateAudioMusePlaylist(...args),
}));

import { saveGeneratedPlaylist } from "@/services/saveGeneratedPlaylist";

beforeEach(() => {
  mockCreateSnapshot.mockReset().mockResolvedValue("pl-1");
  mockCreateAudioMusePlaylist.mockReset().mockResolvedValue(undefined);
});

describe("saveGeneratedPlaylist", () => {
  it("creates the playlist through the backend and returns its id", async () => {
    await expect(
      saveGeneratedPlaylist("backend", "Bicep Mix", ["a", "b"]),
    ).resolves.toBe("pl-1");
    expect(mockCreateSnapshot).toHaveBeenCalledWith("Bicep Mix", ["a", "b"]);
    expect(mockCreateAudioMusePlaylist).not.toHaveBeenCalled();
  });

  it("hands the playlist to AudioMuse, which reports no id", async () => {
    await expect(
      saveGeneratedPlaylist("audiomuse", "Bicep Mix", ["a"]),
    ).resolves.toBeUndefined();
    expect(mockCreateAudioMusePlaylist).toHaveBeenCalledWith("Bicep Mix", [
      "a",
    ]);
    expect(mockCreateSnapshot).not.toHaveBeenCalled();
  });

  it("propagates a failed write so the dialog can report it", async () => {
    mockCreateSnapshot.mockRejectedValue(new Error("boom"));
    await expect(
      saveGeneratedPlaylist("backend", "Bicep Mix", ["a"]),
    ).rejects.toThrow("boom");
  });
});
