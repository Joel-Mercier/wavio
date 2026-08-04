// Android Auto can browse a tree the native side restored from disk into a
// process where JS has only just booted (issue #144), so a tap routinely
// arrives before buildBrowseTree() has populated the in-memory snapshot. The
// resolver has to fall back to the server instead of dropping the tap.
const mockGetAlbum = jest.fn();
const mockGetSong = jest.fn();
const mockGetPlaylist = jest.fn();
const mockGetStarred2 = jest.fn();
const mockPlayTracks = jest.fn();
let mockRecentPlays: Record<string, unknown>[] = [];

const emptySnapshot = () => ({
  tracks: new Map(),
  playlists: new Map(),
  albums: new Map(),
  artistTopSongs: new Map(),
  parentTracks: new Map<string, string[]>(),
});
let mockSnapshot = emptySnapshot();

jest.mock("@/services/backend/browsing", () => ({
  getAlbum: (...args: unknown[]) => mockGetAlbum(...args),
  getArtist: jest.fn(),
  getSong: (...args: unknown[]) => mockGetSong(...args),
}));

jest.mock("@/services/backend/playlists", () => ({
  getPlaylist: (...args: unknown[]) => mockGetPlaylist(...args),
}));

jest.mock("@/services/backend/lists", () => ({
  getStarred2: (...args: unknown[]) => mockGetStarred2(...args),
}));

jest.mock("@/services/player", () => ({
  playTracks: (...args: unknown[]) => mockPlayTracks(...args),
}));

jest.mock("@/services/topSongs", () => ({
  fetchTopSongs: jest.fn(),
  supportsTopSongsById: () => false,
}));

jest.mock("@/stores/recentPlays", () => ({
  __esModule: true,
  default: { getState: () => ({ recentPlays: mockRecentPlays }) },
}));

jest.mock("@/utils/childToTrack", () => ({
  childToTrack: (child: { id: string }) => child,
}));

jest.mock("@/services/carAuto/tree", () => ({
  getSnapshot: () => mockSnapshot,
}));

import { handleBrowsePlay } from "@/services/carAuto/play";

const song = (id: string) => ({ id, title: id });

beforeEach(() => {
  mockGetAlbum.mockReset();
  mockGetSong.mockReset();
  mockGetPlaylist.mockReset();
  mockGetStarred2.mockReset();
  mockPlayTracks.mockReset().mockReturnValue(true);
  mockRecentPlays = [];
  mockSnapshot = emptySnapshot();
});

describe("handleBrowsePlay with a cold snapshot", () => {
  it("fetches the album and starts at the tapped track", async () => {
    mockGetAlbum.mockResolvedValue({
      album: { song: [song("s1"), song("s2"), song("s3")] },
    });

    const played = await handleBrowsePlay("track|album:a1|s2");

    expect(played).toBe(true);
    expect(mockGetAlbum).toHaveBeenCalledWith("a1");
    expect(mockPlayTracks).toHaveBeenCalledWith(
      [song("s1"), song("s2"), song("s3")],
      1,
    );
  });

  it("fetches the playlist and starts at the tapped track", async () => {
    mockGetPlaylist.mockResolvedValue({
      playlist: { entry: [song("s1"), song("s2")] },
    });

    await handleBrowsePlay("track|playlist:p1|s2");

    expect(mockPlayTracks).toHaveBeenCalledWith([song("s1"), song("s2")], 1);
  });

  it("falls back to the favorites list from the server", async () => {
    mockGetStarred2.mockResolvedValue({
      starred2: { song: [song("s1"), song("s2")] },
    });

    await handleBrowsePlay("track|favorites|s2");

    expect(mockPlayTracks).toHaveBeenCalledWith([song("s1"), song("s2")], 1);
  });

  it("plays the tapped song alone when its parent isn't a tracklist", async () => {
    mockGetSong.mockResolvedValue({ song: song("s9") });

    const played = await handleBrowsePlay("track|home:section:recent|s9");

    expect(played).toBe(true);
    expect(mockGetSong).toHaveBeenCalledWith("s9");
    expect(mockPlayTracks).toHaveBeenCalledWith([song("s9")], 0);
  });

  it("fetches a legacy parentless track id", async () => {
    mockGetSong.mockResolvedValue({ song: song("s7") });

    await handleBrowsePlay("track:s7");

    expect(mockGetSong).toHaveBeenCalledWith("s7");
    expect(mockPlayTracks).toHaveBeenCalledWith([song("s7")], 0);
  });

  it("gives up rather than replacing the queue when nothing resolves", async () => {
    mockGetAlbum.mockRejectedValue(new Error("offline"));
    mockGetSong.mockRejectedValue(new Error("offline"));

    const played = await handleBrowsePlay("track|album:a1|s2");

    expect(played).toBe(false);
    expect(mockPlayTracks).not.toHaveBeenCalled();
  });

  it("plays a recently played radio station", async () => {
    mockRecentPlays = [
      {
        id: "st1",
        type: "internetRadioStation",
        title: "FIP",
        streamUrl: "http://stream/fip",
        coverArt: "http://img/fip",
        source: "radioBrowser",
      },
    ];

    const played = await handleBrowsePlay("radio:st1");

    expect(played).toBe(true);
    expect(mockPlayTracks).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "st1", url: "http://stream/fip" })],
      0,
    );
  });
});

describe("handleBrowsePlay with a warm snapshot", () => {
  it("enqueues the cached collection without hitting the server", async () => {
    mockSnapshot.tracks.set("s1", song("s1"));
    mockSnapshot.tracks.set("s2", song("s2"));
    mockSnapshot.parentTracks.set("album:a1", [
      "track|album:a1|s1",
      "track|album:a1|s2",
    ]);

    await handleBrowsePlay("track|album:a1|s2");

    expect(mockGetAlbum).not.toHaveBeenCalled();
    expect(mockPlayTracks).toHaveBeenCalledWith([song("s1"), song("s2")], 1);
  });
});
