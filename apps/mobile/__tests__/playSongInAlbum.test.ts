// A song tapped in search results plays with its album as the queue context,
// the same queue the album screen builds, falling back to the lone track only
// when the album can't be resolved.
const mockGetAlbum = jest.fn();
const mockPlayTracks = jest.fn();
const mockAddRecentPlay = jest.fn();
const mockGetQueryData = jest.fn();
let mockOnline = true;

jest.mock("@/services/backend/browsing", () => ({
  getAlbum: (...args: unknown[]) => mockGetAlbum(...args),
}));

jest.mock("@/services/player", () => ({
  playTracks: (...args: unknown[]) => mockPlayTracks(...args),
}));

jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => mockOnline,
}));

jest.mock("@/config/queryClient", () => ({
  queryClient: {
    getQueryData: (...args: unknown[]) => mockGetQueryData(...args),
    fetchQuery: ({ queryFn }: { queryFn: () => unknown }) => queryFn(),
  },
}));

jest.mock("@/stores/recentPlays", () => ({
  __esModule: true,
  default: { getState: () => ({ addRecentPlay: mockAddRecentPlay }) },
}));

jest.mock("@/utils/log", () => ({ logError: jest.fn() }));

jest.mock("@/utils/childToTrack", () => ({
  childToTrack: (child: { id: string }) => child,
}));

import type { Child } from "@/services/openSubsonic/types";
import { playAlbumFromSong, playSongInAlbum } from "@/services/playSongInAlbum";

const album = {
  id: "al1",
  name: "Flower Boy",
  coverArt: "cov",
  song: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
};
const song = { id: "s2", albumId: "al1", title: "911" } as Child;

beforeEach(() => {
  mockGetAlbum.mockReset();
  mockPlayTracks.mockReset().mockReturnValue(true);
  mockAddRecentPlay.mockReset();
  mockGetQueryData.mockReset().mockReturnValue(undefined);
  mockOnline = true;
  mockGetAlbum.mockResolvedValue({ album });
});

describe("playSongInAlbum", () => {
  it("queues the whole album starting at the song", async () => {
    await expect(playSongInAlbum(song)).resolves.toBe(true);
    expect(mockPlayTracks).toHaveBeenCalledWith(album.song, 1, {
      source: { type: "album", id: "al1", name: "Flower Boy", coverArt: "cov" },
    });
    expect(mockAddRecentPlay).toHaveBeenCalledWith({
      id: "al1",
      title: "Flower Boy",
      type: "album",
      coverArt: "cov",
    });
  });

  it("uses the cached album without a request", async () => {
    mockGetQueryData.mockReturnValue({ album });
    await playSongInAlbum(song);
    expect(mockGetQueryData).toHaveBeenCalledWith(["album", "al1"]);
    expect(mockGetAlbum).not.toHaveBeenCalled();
    expect(mockPlayTracks).toHaveBeenCalledWith(
      album.song,
      1,
      expect.anything(),
    );
  });

  it("plays the song alone when it has no album", async () => {
    const orphan = { id: "s9", title: "Loose" } as Child;
    await playSongInAlbum(orphan);
    expect(mockGetAlbum).not.toHaveBeenCalled();
    expect(mockPlayTracks).toHaveBeenCalledWith([orphan], 0);
  });

  it("plays the song alone offline without a cached album", async () => {
    mockOnline = false;
    await playSongInAlbum(song);
    expect(mockGetAlbum).not.toHaveBeenCalled();
    expect(mockPlayTracks).toHaveBeenCalledWith([song], 0);
  });

  it("plays the song alone when the album fetch fails", async () => {
    mockGetAlbum.mockRejectedValue(new Error("boom"));
    await playSongInAlbum(song);
    expect(mockPlayTracks).toHaveBeenCalledWith([song], 0);
    expect(mockAddRecentPlay).not.toHaveBeenCalled();
  });

  it("plays the song alone when the album no longer lists it", async () => {
    mockGetAlbum.mockResolvedValue({
      album: { ...album, song: [{ id: "x" }] },
    });
    await playSongInAlbum(song);
    expect(mockPlayTracks).toHaveBeenCalledWith([song], 0);
  });
});

describe("playAlbumFromSong", () => {
  it("reports false instead of falling back when the album is unresolvable", async () => {
    mockOnline = false;
    await expect(playAlbumFromSong("s2", "al1")).resolves.toBe(false);
    expect(mockPlayTracks).not.toHaveBeenCalled();
  });
});
