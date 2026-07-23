// Applying a correction can move an album to a new grouping key, and the
// review-queue row has to move with it. Everything that touches SQLite, the
// network or the native tagger is mocked: what's under test is the bookkeeping
// applyMatch does around those calls.
const mockUpsertTrackOverride = jest.fn();
const mockUpsertAlbumMatch = jest.fn();
const mockDeleteAlbumMatch = jest.fn();

jest.mock("@/services/local/tagOverrides", () => ({
  upsertTrackOverride: (row: unknown) => mockUpsertTrackOverride(row),
  upsertAlbumMatch: (row: unknown) => mockUpsertAlbumMatch(row),
  deleteAlbumMatch: (key: string) => mockDeleteAlbumMatch(key),
  clearAlbumMatches: jest.fn(),
  clearAllTrackOverrides: jest.fn(),
  queryAlbumMatches: jest.fn(async () => []),
}));

const mockAlbums: { rows: unknown[] } = { rows: [] };
const mockQueryAlbums = jest.fn(async () => mockAlbums.rows);

jest.mock("@/services/local/repository", () => ({
  queryAlbums: () => mockQueryAlbums(),
  queryAlbumTracksByKey: jest.fn(async () => []),
  queryTrackById: jest.fn(async () => null),
}));

// matchAlbum is the scan's only slow step. Stubbing the network layer it sits on
// lets a scan run to completion in a test while staying honest about the real
// call sequence — the scanner's own matching logic is untouched.
const mockSearchRelease = jest.fn(async (..._args: unknown[]) => [] as never[]);

jest.mock("@/services/musicbrainz/search", () => ({
  searchRelease: (...args: unknown[]) => mockSearchRelease(...args),
  searchRecording: jest.fn(async () => []),
  lookupRelease: jest.fn(),
}));

const mockFetchReleaseCover = jest.fn(
  async (_id: string) => null as string | null,
);

jest.mock("@/services/musicbrainz/coverArt", () => ({
  fetchReleaseCover: (id: string) => mockFetchReleaseCover(id),
  clearDownloadedCovers: jest.fn(),
}));

jest.mock("@/services/musicbrainz/fileWriter", () => ({
  isFileWritingAvailable: () => false,
  writeTagsToFile: jest.fn(async () => false),
}));

jest.mock("@/services/errorReporting", () => ({ reportError: jest.fn() }));

// Mock MMKV-backed storage with an in-memory implementation.
jest.mock("@/config/storage", () => ({
  createDynamicScopedStorage: () => {
    const mem = new Map<string, string>();
    return {
      setItem: (k: string, v: string) => mem.set(k, v),
      getItem: (k: string) => mem.get(k) ?? null,
      removeItem: (k: string) => mem.delete(k),
    };
  },
  getAuthScope: () => "scope",
}));

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ url: "u", username: "n" }) },
  currentAuthScope: () => "scope",
}));

import {
  applyMatch,
  cancelMatchScan,
  getMatchScanStatus,
  type MatchResult,
  startMatchScan,
  subscribeMatchScan,
} from "@/services/musicbrainz/scanner";
import type { TrackProposal } from "@/services/musicbrainz/tagging";
import type { LocalAlbumCandidate } from "@/services/musicbrainz/types";
import useMusicBrainz from "@/stores/musicbrainz";

const LOCAL: LocalAlbumCandidate = {
  albumKey: "dumy portished",
  album: "Dumy",
  albumArtist: "Portished",
  year: 1993,
  tracks: [],
};

const proposal = (albumKey: string | null): TrackProposal =>
  ({
    local: { trackId: "local-track:1", artworkPath: "file:///cover.jpg" },
    mbTrack: null,
    diffs: [],
    override: { track_id: "local-track:1", album_key: albumKey },
  }) as unknown as TrackProposal;

const result = (overrides: Partial<MatchResult> = {}): MatchResult => ({
  source: "release",
  displayTitle: "Dummy",
  releaseId: "rel-1",
  confidence: 0.95,
  proposals: [proposal("dummy portishead")],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAlbums.rows = [];
  useMusicBrainz.getState().setLastScanAt(null);
});

describe("applyMatch review-queue bookkeeping", () => {
  it("re-files the match row under the album's new key", async () => {
    await applyMatch(LOCAL, result(), []);

    expect(mockDeleteAlbumMatch).toHaveBeenCalledWith("dumy portished");
    expect(mockUpsertAlbumMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        album_key: "dummy portishead",
        status: "applied",
      }),
    );
  });

  it("leaves the row in place when the album didn't move", async () => {
    // A null key override means the album stays under its scanned key, so
    // there is nothing to re-file.
    await applyMatch(LOCAL, result({ proposals: [proposal(null)] }), []);

    expect(mockDeleteAlbumMatch).not.toHaveBeenCalled();
    expect(mockUpsertAlbumMatch).toHaveBeenCalledWith(
      expect.objectContaining({ album_key: "dumy portished" }),
    );
  });

  it("keeps per-recording matches under the key the scan found them", async () => {
    // Each track was attributed independently, so no single new key speaks for
    // the album — the row stays where the scan put it.
    await applyMatch(
      LOCAL,
      result({ source: "recordings", releaseId: null }),
      [],
    );

    expect(mockDeleteAlbumMatch).not.toHaveBeenCalled();
    expect(mockUpsertAlbumMatch).toHaveBeenCalledWith(
      expect.objectContaining({ album_key: "dumy portished" }),
    );
  });
});

// `lastScanAt` means "the library has been swept" — the Integrations badge reads
// it, so a run that stopped after a handful of albums must not set it.
describe("scan cancellation", () => {
  const album = (n: number) => ({
    album_key: `k${n}`,
    name: `Album ${n}`,
    album_artist: "Artist",
    artist: "Artist",
    year: null,
  });

  it("reports a completed scan as done and records the sweep", async () => {
    mockAlbums.rows = [album(1), album(2)];

    await startMatchScan();

    expect(getMatchScanStatus().phase).toBe("done");
    expect(getMatchScanStatus().processed).toBe(2);
    expect(useMusicBrainz.getState().lastScanAt).not.toBeNull();
  });

  it("reports a cancelled scan as cancelled, not done", async () => {
    mockAlbums.rows = [album(1), album(2), album(3)];
    // Stop the run from inside the first album's lookup, so albums 2 and 3 are
    // never processed.
    mockSearchRelease.mockImplementationOnce(async () => {
      cancelMatchScan();
      return [];
    });

    await startMatchScan();

    expect(getMatchScanStatus().phase).toBe("cancelled");
  });

  it("does not record a sweep it never finished", async () => {
    mockAlbums.rows = [album(1), album(2), album(3)];
    mockSearchRelease.mockImplementationOnce(async () => {
      cancelMatchScan();
      return [];
    });

    await startMatchScan();

    expect(getMatchScanStatus().processed).toBeLessThan(3);
    expect(useMusicBrainz.getState().lastScanAt).toBeNull();
  });

  it("keeps the work it did complete", async () => {
    // The albums processed before the stop are matched and persisted, which is
    // why cancelling reports its own phase instead of dropping back to idle.
    mockAlbums.rows = [album(1), album(2), album(3)];
    mockSearchRelease.mockImplementationOnce(async () => {
      cancelMatchScan();
      return [];
    });

    await startMatchScan();

    expect(mockUpsertAlbumMatch).toHaveBeenCalled();
  });

  it("still counts a sweep done when the cancel lands on the last album", () => {
    // The flag tracks unprocessed albums, not whether cancel was pressed: if
    // every album was matched anyway, the library really was swept.
    mockAlbums.rows = [album(1)];
    mockSearchRelease.mockImplementationOnce(async () => {
      cancelMatchScan();
      return [];
    });

    return startMatchScan().then(() => {
      expect(getMatchScanStatus().phase).toBe("done");
      expect(useMusicBrainz.getState().lastScanAt).not.toBeNull();
    });
  });

  it("lets a later scan run after a cancellation", async () => {
    mockAlbums.rows = [album(1), album(2)];
    mockSearchRelease.mockImplementationOnce(async () => {
      cancelMatchScan();
      return [];
    });
    await startMatchScan();
    expect(getMatchScanStatus().phase).toBe("cancelled");

    // A cancelled run must clear the in-flight controller, or every later scan
    // would return immediately at the `if (controller) return` guard.
    await startMatchScan();

    expect(getMatchScanStatus().phase).toBe("done");
    expect(getMatchScanStatus().processed).toBe(2);
    expect(useMusicBrainz.getState().lastScanAt).not.toBeNull();
  });

  it("streams the final phase to subscribers", async () => {
    const seen: string[] = [];
    const unsubscribe = subscribeMatchScan((s) => seen.push(s.phase));
    mockAlbums.rows = [album(1), album(2)];
    mockSearchRelease.mockImplementationOnce(async () => {
      cancelMatchScan();
      return [];
    });

    await startMatchScan();
    unsubscribe();

    expect(seen.at(-1)).toBe("cancelled");
  });
});

// A scan that dies has to say so. It previously fell back to "idle" carrying an
// `error` nothing rendered, so a failed run looked exactly like one that had
// never been started.
describe("scan failure", () => {
  const album = (n: number) => ({
    album_key: `k${n}`,
    name: `Album ${n}`,
    album_artist: "Artist",
    artist: "Artist",
    year: null,
  });

  it("reports a broken scan as failed, not idle", async () => {
    mockQueryAlbums.mockRejectedValueOnce(new Error("database is closed"));

    await startMatchScan();

    expect(getMatchScanStatus().phase).toBe("failed");
  });

  it("carries the reason, so the screen can show why", async () => {
    mockQueryAlbums.mockRejectedValueOnce(new Error("database is closed"));

    await startMatchScan();

    expect(getMatchScanStatus().error).toContain("database is closed");
  });

  it("does not record a sweep that broke", async () => {
    mockQueryAlbums.mockRejectedValueOnce(new Error("database is closed"));

    await startMatchScan();

    expect(useMusicBrainz.getState().lastScanAt).toBeNull();
  });

  it("lets a later scan run after a failure", async () => {
    mockQueryAlbums.mockRejectedValueOnce(new Error("database is closed"));
    await startMatchScan();
    expect(getMatchScanStatus().phase).toBe("failed");

    mockAlbums.rows = [album(1)];
    await startMatchScan();

    expect(getMatchScanStatus().phase).toBe("done");
  });

  it("clears a previous failure when the next scan starts", async () => {
    mockQueryAlbums.mockRejectedValueOnce(new Error("database is closed"));
    await startMatchScan();

    mockAlbums.rows = [album(1)];
    await startMatchScan();

    expect(getMatchScanStatus().error).toBeUndefined();
  });

  it("survives one album failing without failing the run", async () => {
    // The counterpart contract: the inner catch costs that album, not the scan.
    // Confusing the two is what would make a single unparseable release look
    // like a broken run.
    mockAlbums.rows = [album(1), album(2)];
    mockSearchRelease.mockImplementationOnce(async () => {
      throw new Error("unparseable release");
    });

    await startMatchScan();

    expect(getMatchScanStatus().phase).toBe("done");
    expect(getMatchScanStatus().processed).toBe(2);
    expect(getMatchScanStatus().unmatched).toBeGreaterThan(0);
    expect(useMusicBrainz.getState().lastScanAt).not.toBeNull();
  });
});

// Most releases have no cover in the archive, and every track of an album
// carries the same release id — so the empty answer has to be remembered for
// the run, or one album asks for the same missing image once per track.
describe("cover art fetching", () => {
  const needsCover = (trackId: string, releaseId: string | null) =>
    ({
      local: { trackId, artworkPath: null },
      mbTrack: null,
      diffs: [],
      override: {
        track_id: trackId,
        album_key: null,
        mb_release_id: releaseId,
      },
    }) as unknown as TrackProposal;

  const album = (count: number, releaseId = "rel-1") =>
    result({
      releaseId,
      proposals: Array.from({ length: count }, (_, i) =>
        needsCover(`t${i}`, releaseId),
      ),
    });

  it("fetches one cover for a whole album", async () => {
    mockFetchReleaseCover.mockResolvedValue("file:///cover.jpg");

    await applyMatch(LOCAL, album(12), ["coverArt"]);

    expect(mockFetchReleaseCover).toHaveBeenCalledTimes(1);
  });

  it("asks once even when the release has no cover", async () => {
    // The stampede: a null result is a real answer and must be remembered, or
    // every track re-requests the same missing image.
    mockFetchReleaseCover.mockResolvedValue(null);

    await applyMatch(LOCAL, album(12), ["coverArt"]);

    expect(mockFetchReleaseCover).toHaveBeenCalledTimes(1);
  });

  it("gives every track of the album the same cover", async () => {
    mockFetchReleaseCover.mockResolvedValue("file:///cover.jpg");

    await applyMatch(LOCAL, album(3), ["coverArt"]);

    for (const call of mockUpsertTrackOverride.mock.calls) {
      expect(call[0].artwork_path).toBe("file:///cover.jpg");
    }
  });

  it("fetches per release when tracks were matched individually", async () => {
    // A per-recording match leaves releaseId null and attributes each track to
    // its own release, so distinct releases must still be fetched separately.
    mockFetchReleaseCover.mockResolvedValue("file:///cover.jpg");

    await applyMatch(
      LOCAL,
      result({
        source: "recordings",
        releaseId: null,
        proposals: [
          needsCover("t1", "rel-a"),
          needsCover("t2", "rel-b"),
          needsCover("t3", "rel-a"),
          needsCover("t4", "rel-b"),
        ],
      }),
      ["coverArt"],
    );

    expect(mockFetchReleaseCover).toHaveBeenCalledTimes(2);
  });

  it("fetches nothing when cover art is not a selected field", async () => {
    await applyMatch(LOCAL, album(5), ["title"]);

    expect(mockFetchReleaseCover).not.toHaveBeenCalled();
  });

  it("fetches nothing when every track already has artwork", async () => {
    // Artwork already in the file is something the user chose; the matcher
    // only fills gaps.
    await applyMatch(LOCAL, result(), ["coverArt"]);

    expect(mockFetchReleaseCover).not.toHaveBeenCalled();
  });
});
