const mockGetListing = jest.fn();
const mockGetArtistSongs = jest.fn();
const mockPlayTracks = jest.fn((..._args: unknown[]) => true);
const mockRefuseHiddenPick = jest.fn((..._args: unknown[]) => false);
const mockGetTracks = jest.fn();
const mockAddRecentPlay = jest.fn();
const mockRadioStationTrack = jest.fn();
let mockQueueState: { source: unknown; current: unknown } = {
  source: null,
  current: null,
};

jest.mock("@/services/audiobookshelf/play", () => ({
  playAudiobook: jest.fn(),
}));
jest.mock("@/services/backend/browsing", () => ({
  getArtistSongs: (...args: unknown[]) => mockGetArtistSongs(...args),
  getSong: jest.fn(),
}));
jest.mock("@/services/player", () => ({
  playTracks: (...args: unknown[]) => mockPlayTracks(...args),
  refuseHiddenPick: (...args: unknown[]) => mockRefuseHiddenPick(...args),
}));
jest.mock("@/services/carAuto/browse", () => ({
  getListing: (...args: unknown[]) => mockGetListing(...args),
  getTracks: (...args: unknown[]) => mockGetTracks(...args),
}));
jest.mock("@/services/carAuto/providers/mixes", () => ({
  mixTracks: jest.fn(),
}));
jest.mock("@/services/carAuto/providers/radio", () => ({
  radioStationTrack: (...args: unknown[]) => mockRadioStationTrack(...args),
}));
jest.mock("@/stores/queue", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      source: mockQueueState.source,
      getCurrent: () => mockQueueState.current,
    }),
  },
}));
jest.mock("@/stores/recentPlays", () => ({
  __esModule: true,
  default: {
    getState: () => ({ addRecentPlay: mockAddRecentPlay }),
  },
}));
jest.mock("@/utils/childToTrack", () => ({
  childToTrack: (child: { id: string }) => child,
}));

import { playMediaId } from "@/services/carAuto/play";

const source = { type: "artist", id: "ar1", name: "Bicep" };

beforeEach(() => {
  jest.clearAllMocks();
  mockQueueState = { source: null, current: null };
});

describe("playing an artist", () => {
  it("plays the top songs when the server has them", async () => {
    mockGetListing.mockResolvedValue({
      nodes: [],
      tracks: [{ id: "top1" }],
      source,
    });

    expect(await playMediaId("artist:ar1")).toBe(true);

    expect(mockGetArtistSongs).not.toHaveBeenCalled();
    expect(mockPlayTracks).toHaveBeenCalledWith([{ id: "top1" }], 0, {
      source,
    });
  });

  it("falls back to the artist's own songs when there are no top songs", async () => {
    mockGetListing.mockResolvedValue({ nodes: [], tracks: [], source });
    mockGetArtistSongs.mockResolvedValue({
      artistSongs: { song: [{ id: "s1" }, { id: "s2" }] },
    });

    expect(await playMediaId("artist:ar1")).toBe(true);

    expect(mockGetArtistSongs).toHaveBeenCalledWith("ar1");
    expect(mockPlayTracks).toHaveBeenCalledWith(
      [{ id: "s1" }, { id: "s2" }],
      0,
      { source },
    );
  });

  it("reports failure when the artist has no songs at all", async () => {
    mockGetListing.mockResolvedValue({ nodes: [], tracks: [], source });
    mockGetArtistSongs.mockResolvedValue({ artistSongs: { song: [] } });

    expect(await playMediaId("artist:ar1")).toBe(false);
    expect(mockPlayTracks).not.toHaveBeenCalled();
  });
});

describe("playing a tapped track", () => {
  const album = { tracks: [{ id: "s1" }, { id: "s2" }, { id: "s3" }] };

  it("starts the collection at the tapped track", async () => {
    mockGetTracks.mockResolvedValue(album);

    expect(await playMediaId("track|album:a1|s2")).toBe(true);

    expect(mockPlayTracks).toHaveBeenCalledWith(album.tracks, 1, {
      source: undefined,
    });
  });

  it("plays nothing when the tapped track is hidden", async () => {
    mockGetTracks.mockResolvedValue(album);
    mockRefuseHiddenPick.mockReturnValueOnce(true);

    expect(await playMediaId("track|album:a1|s2")).toBe(false);
    expect(mockRefuseHiddenPick).toHaveBeenCalledWith({ id: "s2" });
    expect(mockPlayTracks).not.toHaveBeenCalled();
  });
});

describe("recent plays", () => {
  it("records the album a track was played from", async () => {
    const album = { type: "album", id: "al1", name: "Isles", coverArt: "c1" };
    mockGetTracks.mockResolvedValue({ tracks: [{ id: "t1" }], source: album });
    mockQueueState = { source: album, current: { id: "t1" } };

    expect(await playMediaId("track|album:al1|t1")).toBe(true);

    expect(mockAddRecentPlay).toHaveBeenCalledWith({
      id: "al1",
      title: "Isles",
      type: "album",
      coverArt: "c1",
    });
  });

  it("records a radio station with what its shortcut needs to reopen it", async () => {
    const station = {
      id: "st1",
      title: "Radio Nova",
      artwork: "https://nova/logo.png",
      homePageUrl: "https://nova",
      streamUrl: "https://nova/stream",
      source: "radioBrowser",
      isRadio: true,
    };
    mockRadioStationTrack.mockResolvedValue(station);
    mockQueueState = { source: null, current: station };

    expect(await playMediaId("radio:st1")).toBe(true);

    expect(mockAddRecentPlay).toHaveBeenCalledWith({
      id: "st1",
      title: "Radio Nova",
      type: "internetRadioStation",
      coverArt: "https://nova/logo.png",
      homePageUrl: "https://nova",
      streamUrl: "https://nova/stream",
      source: "radioBrowser",
    });
  });

  it("leaves generated lists and failed plays out", async () => {
    mockGetTracks.mockResolvedValue({ tracks: [{ id: "t1" }] });
    mockQueueState = {
      source: { type: "mix", name: "Shuffle" },
      current: { id: "t1" },
    };
    await playMediaId("downloads:songs");

    mockPlayTracks.mockReturnValueOnce(false);
    mockQueueState = {
      source: { type: "album", id: "al1", name: "Isles" },
      current: null,
    };
    await playMediaId("track|album:al1|t1");

    expect(mockAddRecentPlay).not.toHaveBeenCalled();
  });
});
