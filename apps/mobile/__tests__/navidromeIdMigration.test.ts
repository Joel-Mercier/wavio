jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => mem.set(k, v),
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => mem.delete(k),
  });
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: make(),
    createScopedStorage: () => make(),
    createDynamicScopedStorage: () => make(),
    getAuthScope: () => "scope",
  };
});

jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({ url: "u", username: "n", serverType: "navidrome" }),
  },
  currentAuthScope: () => "scope",
}));

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { MD5: "MD5" },
  CryptoEncoding: { HEX: "hex" },
  digestStringAsync: jest.fn(async (_algorithm: string, data: string) =>
    require("node:crypto").createHash("md5").update(data).digest("hex"),
  ),
}));

let mockOnline = true;
jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => mockOnline,
}));

const mockClear = jest.fn();
const mockRemoveClient = jest.fn();
jest.mock("@/config/queryClient", () => ({
  queryClient: { clear: () => mockClear() },
  queryPersister: { removeClient: () => mockRemoveClient() },
}));

jest.mock("@/services/backend/streaming", () => ({
  streamUrl: (id: string) => `https://srv/rest/stream?id=${id}`,
}));

const mockDiscardInFlight = jest.fn();
jest.mock("@/services/offline/downloadService", () => ({
  offlineDownloadService: {
    discardInFlightDownloads: () => mockDiscardInFlight(),
  },
}));

const mockDrainOfflineMutations = jest.fn();
jest.mock("@/services/offlineMutations/replay", () => ({
  drainOfflineMutations: () => mockDrainOfflineMutations(),
}));

jest.mock("@/utils/artwork", () => ({
  artworkUrl: (id?: string) => (id ? `https://srv/art/${id}` : undefined),
}));

const mockSongsExist = jest.fn();
jest.mock("@/services/backend/browsing", () => ({
  songsExist: (ids: string[]) => mockSongsExist(ids),
}));

// Navidrome's extension list at the commit that introduced the id migration.
// Its parent commit is the one that added topSongsByArtistId, so a server
// advertising the extension is the only kind that can have migrated.
const MIGRATION_ERA_EXTENSIONS = [
  { name: "transcodeOffset", versions: [1] },
  { name: "formPost", versions: [1] },
  { name: "songLyrics", versions: [1, 2] },
  { name: "indexBasedQueue", versions: [1] },
  { name: "transcoding", versions: [1] },
  { name: "playbackReport", versions: [1] },
  { name: "topSongsByArtistId", versions: [1] },
];
const PRE_MIGRATION_EXTENSIONS = MIGRATION_ERA_EXTENSIONS.filter(
  (e) => e.name !== "topSongsByArtistId",
);

const mockGetExtensions = jest.fn();
jest.mock("@/services/backend/system", () => ({
  getOpenSubsonicExtensions: () => mockGetExtensions(),
}));

jest.mock("@/services/errorReporting", () => ({ reportError: jest.fn() }));

import {
  __resetIdMigrationState,
  runIdMigrationCheck,
} from "@/services/navidromeIdMigration";
import { noteServerVersion } from "@/services/navidromeIdMigration/detect";
import { applyCanonicalIdRemap } from "@/services/navidromeIdMigration/remap";
import {
  __resetPlayHistoryReconcile,
  reconcilePlayHistory,
} from "@/services/playHistory/reconcile";
import useActivity from "@/stores/activity";
import useBookmarks from "@/stores/bookmarks";
import useLibrarySync from "@/stores/librarySync";
import useOffline, { type OfflineTrack } from "@/stores/offline";
import useOfflineMutations from "@/stores/offlineMutations";
import usePlayHistory from "@/stores/playHistory";
import usePlaylists from "@/stores/playlists";
import useQueue from "@/stores/queue";
import useRadioStations from "@/stores/radioStations";
import useRecentPlays from "@/stores/recentPlays";
import useRecentSearches from "@/stores/recentSearches";

// Golden pairs from Navidrome's own db/migrations/id_canonical_test.go.
const OLD_SONG = "e3b7fc2ae9447bbec37a13bf916e3cf6";
const NEW_SONG = "6VHl3uR4kss6sUPKA8Cwnk";
const OLD_SONG_2 = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const NEW_SONG_2 = "7rke2SAWaicSeSYzkhww6R";
const OLD_NANOID = "zzzzzzzzzzzzzzzzzzzzzz";
const NEW_NANOID = "3LyqmwQBm5IRqlVjNYASwb";
// Hash-family: canonical already, never rewritten.
const STABLE_ARTIST = "5cLJPkLA5DK2BADhoeotPk";
// A real MusicBrainz id. 36 chars, so the transform *would* rewrite it — the
// migration must never hand it over.
const MBID = "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d";

const track = (
  id: string,
  extra: Partial<OfflineTrack> = {},
): OfflineTrack => ({
  id,
  title: `Track ${id}`,
  duration: 180,
  path: `file:///offline/scope/${id}.mp3`,
  size: 1000,
  downloadedAt: "2026-01-01T00:00:00.000Z",
  coverArt: `mf-${id}_68e67692`,
  ...extra,
});

const resetStores = () => {
  useOffline.setState({
    downloadedTracks: {},
    downloadedCollections: {},
    downloadProgress: {},
    downloadQueue: [],
    artworkCache: {},
    artworkCachedAt: {},
    artworkAliases: {},
  });
  useQueue.setState({ queue: [], originalOrderIds: null, source: null });
  usePlayHistory.setState({ history: [] });
  useActivity.setState({ activity: [] });
  useBookmarks.setState({ bookmarks: {} });
  usePlaylists.setState({ playlistSorts: {}, playlistTrackOrders: {} });
  useRecentPlays.setState({ recentPlays: [] });
  useRecentSearches.setState({ recentSearches: [] });
  useRadioStations.setState({ favoriteRadioStations: [] });
  useOfflineMutations.setState({ queue: [] });
  useLibrarySync.getState().__reset();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOnline = true;
  // Default every test to a server that *could* have migrated, so the probe is
  // what decides. The pre-migration case is exercised explicitly below.
  mockGetExtensions.mockResolvedValue({
    openSubsonicExtensions: MIGRATION_ERA_EXTENSIONS,
  });
  __resetIdMigrationState();
  resetStores();
});

describe("noteServerVersion", () => {
  const seedData = () => {
    useOffline.setState({ downloadedTracks: { [OLD_SONG]: track(OLD_SONG) } });
  };

  it("ignores non-Navidrome servers", () => {
    seedData();
    noteServerVersion("0.58.0", "subsonic");
    expect(useLibrarySync.getState().idMigration).toBe("idle");
  });

  it("freezes on a first sighting when local data exists", () => {
    seedData();
    noteServerVersion("0.58.0", "navidrome");
    expect(useLibrarySync.getState().idMigration).toBe("checking");
    expect(useLibrarySync.getState().lastSeenServerVersion).toBe("0.58.0");
  });

  it("does nothing when there is no local data to repair", () => {
    noteServerVersion("0.58.0", "navidrome");
    expect(useLibrarySync.getState().idMigration).toBe("idle");
    expect(useLibrarySync.getState().lastSeenServerVersion).toBe("0.58.0");
  });

  it("ignores rows the remap would not touch anyway", () => {
    // "favorites" is pinned into every scope on hydration, and Radio Browser
    // stations belong to no server: a fresh install must not look populated.
    useRecentPlays.setState({
      recentPlays: [
        { id: "favorites", title: "Favorites", type: "favorites" },
        {
          id: OLD_SONG_2,
          title: "Station",
          type: "internetRadioStation",
          source: "radioBrowser",
        },
      ],
    });
    noteServerVersion("0.58.0", "navidrome");
    expect(useLibrarySync.getState().idMigration).toBe("idle");
  });

  it("freezes for a scope whose only ids sit in the offline mutation queue", () => {
    // The stores the reconcilers would damage are empty, but replaying these
    // against a renumbered server drops them as permanent errors.
    useOfflineMutations.setState({
      queue: [
        {
          id: "m1",
          createdAt: 1,
          retryCount: 0,
          status: "pending",
          action: {
            type: "star",
            target: { kind: "song", id: OLD_SONG },
            starred: true,
          },
        },
      ],
    });
    noteServerVersion("0.58.0", "navidrome");
    expect(useLibrarySync.getState().idMigration).toBe("checking");
  });

  it("freezes when the version string changes", () => {
    seedData();
    useLibrarySync.getState().setIdMigration({
      lastSeenServerVersion: "0.58.0",
      lastProbedAt: Date.now(),
      idMigration: "idle",
    });
    noteServerVersion("0.59.0", "navidrome");
    expect(useLibrarySync.getState().idMigration).toBe("checking");
  });

  it("detects a develop build whose version carries a git sha", () => {
    // The whole reason there is no semver threshold: these do not order.
    seedData();
    useLibrarySync.getState().setIdMigration({
      lastSeenServerVersion: "0.58.0-SNAPSHOT.abc1234",
      lastProbedAt: Date.now(),
      idMigration: "idle",
    });
    noteServerVersion("0.58.0-SNAPSHOT.def5678", "navidrome");
    expect(useLibrarySync.getState().idMigration).toBe("checking");
  });

  it("stays quiet when the version is unchanged", () => {
    seedData();
    useLibrarySync.getState().setIdMigration({
      lastSeenServerVersion: "0.58.0",
      lastProbedAt: Date.now(),
      idMigration: "idle",
    });
    noteServerVersion("0.58.0", "navidrome");
    expect(useLibrarySync.getState().idMigration).toBe("idle");
  });

  it("fires once per version, not once per response", () => {
    seedData();
    noteServerVersion("0.59.0", "navidrome");
    expect(useLibrarySync.getState().idMigration).toBe("checking");
    // Probe came back refuted; the same version must not re-trigger.
    useLibrarySync
      .getState()
      .setIdMigration({ idMigration: "idle", lastProbedAt: Date.now() });
    noteServerVersion("0.59.0", "navidrome");
    noteServerVersion("0.59.0", "navidrome");
    expect(useLibrarySync.getState().idMigration).toBe("idle");
  });

  it("still fires for a second upgrade soon after the first", () => {
    // A rate limit here would swallow the change permanently: the version is
    // already recorded, so no later call would see it as new.
    seedData();
    useLibrarySync.getState().setIdMigration({
      lastSeenServerVersion: "0.58.0",
      lastProbedAt: Date.now(),
      idMigration: "idle",
    });
    noteServerVersion("0.60.0", "navidrome");
    expect(useLibrarySync.getState().idMigration).toBe("checking");
  });
});

describe("runIdMigrationCheck", () => {
  const freeze = () => {
    useOffline.setState({
      downloadedTracks: {
        [OLD_SONG]: track(OLD_SONG),
        [OLD_SONG_2]: track(OLD_SONG_2),
      },
    });
    useLibrarySync.getState().setIdMigration({ idMigration: "checking" });
  };

  it("applies the remap when old ids are gone and computed ids resolve", async () => {
    freeze();
    mockSongsExist.mockResolvedValue({
      present: [NEW_SONG, NEW_SONG_2],
      gone: [OLD_SONG, OLD_SONG_2],
    });
    await runIdMigrationCheck();
    expect(useLibrarySync.getState().idMigration).toBe("migrated");
    expect(useOffline.getState().downloadedTracks[NEW_SONG]).toBeDefined();
  });

  it("refuses when a stored id still resolves", async () => {
    freeze();
    mockSongsExist.mockResolvedValue({
      present: [OLD_SONG, NEW_SONG_2],
      gone: [OLD_SONG_2],
    });
    await runIdMigrationCheck();
    expect(useLibrarySync.getState().idMigration).toBe("idle");
    expect(useOffline.getState().downloadedTracks[OLD_SONG]).toBeDefined();
  });

  it("refuses when the computed id does not resolve either", async () => {
    // This is the port-verification property: a wrong codec produces ids the
    // server has never heard of, and we must abort rather than rewrite.
    freeze();
    mockSongsExist.mockResolvedValue({
      present: [],
      gone: [OLD_SONG, OLD_SONG_2, NEW_SONG, NEW_SONG_2],
    });
    await runIdMigrationCheck();
    expect(useLibrarySync.getState().idMigration).toBe("idle");
    expect(useOffline.getState().downloadedTracks[OLD_SONG]).toBeDefined();
  });

  it("requires corroboration from more than one sample", async () => {
    freeze();
    // The second sample answered — its old id is gone and so is the computed
    // one, i.e. a plain deletion. One hit is not enough to call it a migration.
    mockSongsExist.mockResolvedValue({
      present: [NEW_SONG],
      gone: [OLD_SONG, OLD_SONG_2, NEW_SONG_2],
    });
    await runIdMigrationCheck();
    expect(useLibrarySync.getState().idMigration).toBe("idle");
  });

  it("stays frozen when a sample went unanswered", async () => {
    freeze();
    // songsExist swallows transport failures and 5xx: the id lands in neither
    // list. Reading that as "not migrated" would unfreeze for good, since the
    // new server version has already been recorded.
    mockSongsExist.mockResolvedValue({
      present: [NEW_SONG],
      gone: [OLD_SONG],
    });
    await runIdMigrationCheck();
    expect(useLibrarySync.getState().idMigration).toBe("checking");
    expect(useOffline.getState().downloadedTracks[OLD_SONG]).toBeDefined();
  });

  it("still refuses when a surviving old id answers alongside silence", async () => {
    freeze();
    // An old id that resolves is conclusive on its own — no need to wait for
    // the rest of the samples.
    mockSongsExist.mockResolvedValue({ present: [OLD_SONG], gone: [] });
    await runIdMigrationCheck();
    expect(useLibrarySync.getState().idMigration).toBe("idle");
  });

  it("drains the offline mutation queue once the freeze lifts", async () => {
    freeze();
    mockSongsExist.mockResolvedValue({
      present: [NEW_SONG, NEW_SONG_2],
      gone: [OLD_SONG, OLD_SONG_2],
    });
    await runIdMigrationCheck();
    expect(mockDrainOfflineMutations).toHaveBeenCalled();
  });

  it("stays frozen when the probe throws", async () => {
    freeze();
    mockSongsExist.mockRejectedValue(new Error("network"));
    await runIdMigrationCheck();
    expect(useLibrarySync.getState().idMigration).toBe("checking");
  });

  it("stays frozen while offline", async () => {
    freeze();
    mockOnline = false;
    await runIdMigrationCheck();
    expect(mockSongsExist).not.toHaveBeenCalled();
    expect(useLibrarySync.getState().idMigration).toBe("checking");
  });

  it("clears the freeze without probing when the server predates the migration", async () => {
    // The everyday case: an ordinary point-release bump changed the version
    // string. A server too old to advertise topSongsByArtistId is also too old
    // to have renumbered, so this costs one request instead of twelve.
    freeze();
    mockGetExtensions.mockResolvedValue({
      openSubsonicExtensions: PRE_MIGRATION_EXTENSIONS,
    });
    await runIdMigrationCheck();
    expect(mockSongsExist).not.toHaveBeenCalled();
    expect(useLibrarySync.getState().idMigration).toBe("idle");
    expect(useOffline.getState().downloadedTracks[OLD_SONG]).toBeDefined();
    expect(mockDrainOfflineMutations).toHaveBeenCalled();
  });

  it("still probes when the server advertises the extension", async () => {
    // Advertising it is necessary but not sufficient — the develop image built
    // from the extension's own commit predates the migration by 19 minutes.
    freeze();
    mockSongsExist.mockResolvedValue({
      present: [OLD_SONG, OLD_SONG_2],
      gone: [],
    });
    await runIdMigrationCheck();
    expect(mockSongsExist).toHaveBeenCalled();
    expect(useLibrarySync.getState().idMigration).toBe("idle");
    expect(useOffline.getState().downloadedTracks[OLD_SONG]).toBeDefined();
  });

  it("falls through to the probe when the extension list cannot be fetched", async () => {
    freeze();
    mockGetExtensions.mockRejectedValue(new Error("network"));
    mockSongsExist.mockResolvedValue({
      present: [NEW_SONG, NEW_SONG_2],
      gone: [OLD_SONG, OLD_SONG_2],
    });
    await runIdMigrationCheck();
    expect(useLibrarySync.getState().idMigration).toBe("migrated");
  });

  it("falls through to the probe when the extension list comes back empty", async () => {
    // An empty list is indistinguishable from a server that answered with
    // nothing useful, so it is not proof of anything.
    freeze();
    mockGetExtensions.mockResolvedValue({ openSubsonicExtensions: [] });
    mockSongsExist.mockResolvedValue({
      present: [NEW_SONG, NEW_SONG_2],
      gone: [OLD_SONG, OLD_SONG_2],
    });
    await runIdMigrationCheck();
    expect(mockSongsExist).toHaveBeenCalled();
    expect(useLibrarySync.getState().idMigration).toBe("migrated");
  });

  it("skips ids the transform would not change", async () => {
    // A stable id resolves whether or not the server migrated, so sampling it
    // would tell us nothing.
    useOffline.setState({
      downloadedTracks: { [STABLE_ARTIST]: track(STABLE_ARTIST) },
    });
    useLibrarySync.getState().setIdMigration({ idMigration: "checking" });
    await runIdMigrationCheck();
    expect(mockSongsExist).not.toHaveBeenCalled();
    expect(useLibrarySync.getState().idMigration).toBe("idle");
  });
});

describe("freeze guards", () => {
  it("stops play-history reconciliation while checking", async () => {
    // Post-migration the server reports every stored id as code-70 missing, so
    // an unfrozen pass would prune the whole history.
    usePlayHistory.setState({
      history: [{ id: OLD_SONG, playedAt: 1 }],
    });
    useLibrarySync.getState().setIdMigration({ idMigration: "checking" });
    __resetPlayHistoryReconcile();

    await reconcilePlayHistory();
    expect(mockSongsExist).not.toHaveBeenCalled();
    expect(usePlayHistory.getState().history).toHaveLength(1);
  });

  it("resumes reconciliation once the migration settles", async () => {
    usePlayHistory.setState({ history: [{ id: NEW_SONG, playedAt: 1 }] });
    useLibrarySync.getState().setIdMigration({ idMigration: "migrated" });
    __resetPlayHistoryReconcile();
    mockSongsExist.mockResolvedValue({ present: [NEW_SONG], gone: [] });

    await reconcilePlayHistory();
    expect(mockSongsExist).toHaveBeenCalled();
    expect(usePlayHistory.getState().history).toHaveLength(1);
  });
});

describe("applyCanonicalIdRemap", () => {
  it("rekeys downloaded tracks and keeps the file path", async () => {
    useOffline.setState({ downloadedTracks: { [OLD_SONG]: track(OLD_SONG) } });
    await applyCanonicalIdRemap();

    const tracks = useOffline.getState().downloadedTracks;
    expect(tracks[OLD_SONG]).toBeUndefined();
    expect(tracks[NEW_SONG].id).toBe(NEW_SONG);
    // The filename still embeds the old id; nothing reads it back out.
    expect(tracks[NEW_SONG].path).toBe(`file:///offline/scope/${OLD_SONG}.mp3`);
    expect(tracks[NEW_SONG].coverArt).toBe(`mf-${NEW_SONG}_68e67692`);
    expect(tracks[NEW_SONG].metadata?.legacyId).toBe(OLD_SONG);
  });

  it("remaps collections, their track lists and their artists", async () => {
    useOffline.setState({
      downloadedCollections: {
        [OLD_SONG_2]: {
          id: OLD_SONG_2,
          kind: "playlist",
          name: "Mix",
          songCount: 1,
          trackIds: [OLD_SONG, STABLE_ARTIST],
          coverArt: `pl-${OLD_SONG_2}_1`,
          artistId: STABLE_ARTIST,
          artists: [{ id: STABLE_ARTIST, name: "A" }],
          savedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    await applyCanonicalIdRemap();

    const collections = useOffline.getState().downloadedCollections;
    expect(collections[OLD_SONG_2]).toBeUndefined();
    expect(collections[NEW_SONG_2].id).toBe(NEW_SONG_2);
    expect(collections[NEW_SONG_2].trackIds).toEqual([NEW_SONG, STABLE_ARTIST]);
    expect(collections[NEW_SONG_2].coverArt).toBe(`pl-${NEW_SONG_2}_1`);
    expect(collections[NEW_SONG_2].artists?.[0].id).toBe(STABLE_ARTIST);
  });

  it("rebuilds queue stream URLs, not just ids", async () => {
    useQueue.setState({
      queue: [
        {
          id: OLD_SONG,
          url: `https://srv/rest/stream?id=${OLD_SONG}`,
          coverArt: `mf-${OLD_SONG}_1`,
          albumId: OLD_SONG_2,
          artistId: STABLE_ARTIST,
        },
      ],
      originalOrderIds: [OLD_SONG],
      source: { type: "album", name: "X", id: OLD_SONG_2 },
    });
    await applyCanonicalIdRemap();

    const [entry] = useQueue.getState().queue;
    expect(entry.id).toBe(NEW_SONG);
    // The old id was baked into the URL — rewriting `id` alone leaves 404s.
    expect(entry.url).toBe(`https://srv/rest/stream?id=${NEW_SONG}`);
    expect(entry.coverArt).toBe(`mf-${NEW_SONG}_1`);
    expect(entry.artwork).toBe(`https://srv/art/mf-${NEW_SONG}_1`);
    expect(entry.albumId).toBe(NEW_SONG_2);
    expect(useQueue.getState().originalOrderIds).toEqual([NEW_SONG]);
    expect(useQueue.getState().source?.id).toBe(NEW_SONG_2);
  });

  it("points a downloaded queue entry at its local file", async () => {
    useOffline.setState({ downloadedTracks: { [OLD_SONG]: track(OLD_SONG) } });
    useQueue.setState({
      queue: [{ id: OLD_SONG, url: `file:///offline/scope/${OLD_SONG}.mp3` }],
    });
    await applyCanonicalIdRemap();
    expect(useQueue.getState().queue[0].url).toBe(
      `file:///offline/scope/${OLD_SONG}.mp3`,
    );
  });

  it("leaves queued radio and podcast entries alone", async () => {
    // Both ids are 36-char uuids, so the transform would happily rewrite them,
    // and both `url`s are external streams the player uses verbatim.
    const stationUrl = "https://radio.example/stream.mp3";
    const episodeUrl = "https://podcast.example/ep1.mp3";
    useQueue.setState({
      queue: [
        {
          id: OLD_SONG_2,
          url: stationUrl,
          isRadio: true,
          source: "radioBrowser",
        },
        { id: MBID, url: episodeUrl, source: "podcast" },
      ],
    });
    await applyCanonicalIdRemap();

    const [station, episode] = useQueue.getState().queue;
    expect(station.id).toBe(OLD_SONG_2);
    expect(station.url).toBe(stationUrl);
    expect(episode.id).toBe(MBID);
    expect(episode.url).toBe(episodeUrl);
  });

  it("remaps a queued server radio station's id but never its stream URL", async () => {
    const stationUrl = "https://radio.example/stream.mp3";
    useQueue.setState({
      queue: [
        { id: OLD_SONG_2, url: stationUrl, isRadio: true, source: "server" },
      ],
    });
    await applyCanonicalIdRemap();

    const [station] = useQueue.getState().queue;
    expect(station.id).toBe(NEW_SONG_2);
    expect(station.url).toBe(stationUrl);
  });

  it("never rewrites musicBrainzId", async () => {
    useQueue.setState({
      queue: [{ id: OLD_SONG, url: "x", musicBrainzId: MBID }],
    });
    await applyCanonicalIdRemap();
    expect(useQueue.getState().queue[0].musicBrainzId).toBe(MBID);
  });

  it("remaps play history and drops its stale verification", async () => {
    usePlayHistory.setState({
      history: [
        {
          id: OLD_SONG,
          albumId: OLD_SONG_2,
          coverArt: `mf-${OLD_SONG}_1`,
          playedAt: 1,
          verifiedAt: 123,
        },
      ],
    });
    await applyCanonicalIdRemap();
    const [entry] = usePlayHistory.getState().history;
    expect(entry.id).toBe(NEW_SONG);
    expect(entry.albumId).toBe(NEW_SONG_2);
    expect(entry.coverArt).toBe(`mf-${NEW_SONG}_1`);
    expect(entry.verifiedAt).toBeUndefined();
  });

  it("remaps activity entries and their source", async () => {
    useActivity.setState({
      activity: [
        {
          trackId: OLD_SONG,
          title: "T",
          albumId: OLD_SONG_2,
          source: { type: "album", id: OLD_SONG_2, name: "X" },
          playedAt: 1,
        },
      ],
    });
    await applyCanonicalIdRemap();
    const [entry] = useActivity.getState().activity;
    expect(entry.trackId).toBe(NEW_SONG);
    expect(entry.source?.id).toBe(NEW_SONG_2);
  });

  it("rekeys bookmarks", async () => {
    useBookmarks.setState({ bookmarks: { [OLD_SONG]: [10, 20] } });
    await applyCanonicalIdRemap();
    expect(useBookmarks.getState().bookmarks[NEW_SONG]).toEqual([10, 20]);
    expect(useBookmarks.getState().bookmarks[OLD_SONG]).toBeUndefined();
  });

  it("rekeys playlist orderings and remaps their track ids", async () => {
    usePlaylists.setState({
      playlistSorts: { [OLD_SONG_2]: "custom" as never },
      playlistTrackOrders: { [OLD_SONG_2]: [OLD_SONG, STABLE_ARTIST] },
    });
    await applyCanonicalIdRemap();
    const state = usePlaylists.getState();
    expect(state.playlistSorts[NEW_SONG_2]).toBe("custom");
    expect(state.playlistTrackOrders[NEW_SONG_2]).toEqual([
      NEW_SONG,
      STABLE_ARTIST,
    ]);
  });

  it("remaps recent plays but leaves the synthetic favorites shortcut", async () => {
    useRecentPlays.setState({
      recentPlays: [
        { id: OLD_SONG_2, title: "Album", type: "album" },
        { id: "favorites", title: "Favorites", type: "favorites" },
      ],
    });
    await applyCanonicalIdRemap();
    const plays = useRecentPlays.getState().recentPlays;
    expect(plays[0].id).toBe(NEW_SONG_2);
    expect(plays[1].id).toBe("favorites");
  });

  it("remaps a recently played server station, never a Radio Browser one", async () => {
    useRecentPlays.setState({
      recentPlays: [
        {
          id: OLD_SONG,
          title: "Server station",
          type: "internetRadioStation",
          source: "server",
        },
        {
          id: OLD_SONG_2,
          title: "Radio Browser station",
          type: "internetRadioStation",
          source: "radioBrowser",
        },
      ],
    });
    await applyCanonicalIdRemap();
    const plays = useRecentPlays.getState().recentPlays;
    expect(plays[0].id).toBe(NEW_SONG);
    expect(plays[1].id).toBe(OLD_SONG_2);
  });

  it("remaps song searches but leaves query rows alone", async () => {
    useRecentSearches.setState({
      recentSearches: [
        { id: OLD_SONG, title: "S", type: "song", albumId: OLD_SONG_2 },
        { id: "query:beatles", title: "beatles", type: "query" },
      ],
    });
    await applyCanonicalIdRemap();
    const searches = useRecentSearches.getState().recentSearches;
    expect(searches[0].id).toBe(NEW_SONG);
    expect(searches[0].albumId).toBe(NEW_SONG_2);
    expect(searches[1].id).toBe("query:beatles");
  });

  it("remaps server radio favourites and never Radio Browser ones", async () => {
    useRadioStations.setState({
      favoriteRadioStations: [
        {
          id: OLD_NANOID,
          name: "Server",
          streamUrl: "s",
          source: "server",
          scope: "scope",
          dateAdded: 1,
          isFavorite: true,
        },
        {
          id: MBID,
          name: "Browser",
          streamUrl: "s",
          source: "radioBrowser",
          dateAdded: 1,
          isFavorite: true,
        },
        {
          id: OLD_SONG,
          name: "Other server",
          streamUrl: "s",
          source: "server",
          scope: "other-scope",
          dateAdded: 1,
          isFavorite: true,
        },
      ],
    });
    await applyCanonicalIdRemap();
    const stations = useRadioStations.getState().favoriteRadioStations;
    expect(stations[0].id).toBe(NEW_NANOID);
    // A Radio Browser UUID is 36 chars and would otherwise be rewritten.
    expect(stations[1].id).toBe(MBID);
    // Belongs to a different server, which has not migrated.
    expect(stations[2].id).toBe(OLD_SONG);
  });

  it("remaps every pending offline mutation shape", async () => {
    useOfflineMutations.setState({
      queue: [
        {
          id: "1",
          createdAt: 1,
          retryCount: 0,
          status: "pending",
          action: {
            type: "star",
            target: { kind: "song", id: OLD_SONG },
            starred: true,
          },
        },
        {
          id: "2",
          createdAt: 1,
          retryCount: 0,
          status: "pending",
          action: { type: "setRating", id: OLD_SONG, rating: 4 },
        },
        {
          id: "3",
          createdAt: 1,
          retryCount: 0,
          status: "pending",
          action: {
            type: "playlistAddSongs",
            playlistId: OLD_SONG_2,
            songIds: [OLD_SONG],
          },
        },
        {
          id: "4",
          createdAt: 1,
          retryCount: 0,
          status: "pending",
          action: { type: "playlistDelete", playlistId: OLD_SONG_2 },
        },
      ],
    });
    await applyCanonicalIdRemap();
    const [star, rating, add, del] = useOfflineMutations.getState().queue;
    expect((star.action as { target: { id: string } }).target.id).toBe(
      NEW_SONG,
    );
    expect((rating.action as { id: string }).id).toBe(NEW_SONG);
    expect((add.action as { playlistId: string }).playlistId).toBe(NEW_SONG_2);
    expect((add.action as { songIds: string[] }).songIds).toEqual([NEW_SONG]);
    expect((del.action as { playlistId: string }).playlistId).toBe(NEW_SONG_2);
  });

  it("rekeys artwork cache and aliases", async () => {
    useOffline.setState({
      artworkCache: { [`mf-${OLD_SONG}`]: "file:///a.jpg" },
      artworkCachedAt: { [`mf-${OLD_SONG}`]: "2026-01-01T00:00:00.000Z" },
      artworkAliases: { [`mf-${OLD_SONG}`]: `al-${OLD_SONG_2}` },
    });
    await applyCanonicalIdRemap();
    const offline = useOffline.getState();
    expect(offline.artworkCache[`mf-${NEW_SONG}`]).toBe("file:///a.jpg");
    expect(offline.artworkCachedAt[`mf-${NEW_SONG}`]).toBeDefined();
    expect(offline.artworkAliases[`mf-${NEW_SONG}`]).toBe(`al-${NEW_SONG_2}`);
  });

  it("keeps pending downloads, remapped, and discards in-flight ones", async () => {
    useOffline.setState({
      downloadQueue: [
        { id: OLD_SONG, coverArt: `mf-${OLD_SONG}`, offlineSource: "user" },
      ] as never,
    });
    await applyCanonicalIdRemap();

    // Nothing re-enqueues a user-initiated save, so dropping the queue would
    // silently lose an album the user asked for.
    expect(useOffline.getState().downloadQueue).toEqual([
      { id: NEW_SONG, coverArt: `mf-${NEW_SONG}`, offlineSource: "user" },
    ]);
    // A download already writing to disk carries the pre-migration id and would
    // register it back into the store.
    expect(mockDiscardInFlight).toHaveBeenCalled();
  });

  it("clears derived download state and the crawl cursor", async () => {
    useOffline.setState({
      downloadedTracks: { [OLD_SONG]: track(OLD_SONG) },
      downloadProgress: {
        [OLD_SONG]: { trackId: OLD_SONG, progress: 0.5 } as never,
      },
    });
    useLibrarySync.getState().setCrawl({
      phase: "songs",
      seenSongIds: [OLD_SONG],
      songOffset: 40,
    });
    await applyCanonicalIdRemap();

    expect(useOffline.getState().downloadProgress).toEqual({});
    // A resumed pass carrying the old inventory would read every remapped id as
    // a server-side deletion and delete the files.
    expect(useLibrarySync.getState().seenSongIds).toEqual([]);
    expect(useLibrarySync.getState().phase).toBe("idle");
    expect(useLibrarySync.getState().songOffset).toBe(0);
  });

  it("clears the persisted query cache", async () => {
    useOffline.setState({ downloadedTracks: { [OLD_SONG]: track(OLD_SONG) } });
    await applyCanonicalIdRemap();
    expect(mockClear).toHaveBeenCalled();
    expect(mockRemoveClient).toHaveBeenCalled();
  });

  it("reports how many distinct ids changed", async () => {
    useOffline.setState({
      downloadedTracks: {
        [OLD_SONG]: track(OLD_SONG),
        [STABLE_ARTIST]: track(STABLE_ARTIST),
      },
    });
    const changed = await applyCanonicalIdRemap();
    // OLD_SONG and its `mf-` cover id share one entry; STABLE_ARTIST changes
    // nothing.
    expect(changed).toBe(1);
  });

  it("is idempotent", async () => {
    useOffline.setState({
      downloadedTracks: { [OLD_SONG]: track(OLD_SONG) },
      downloadedCollections: {
        [OLD_SONG_2]: {
          id: OLD_SONG_2,
          kind: "album",
          name: "A",
          songCount: 1,
          trackIds: [OLD_SONG],
          savedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    useQueue.setState({ queue: [{ id: OLD_SONG, url: "x" }] });
    useBookmarks.setState({ bookmarks: { [OLD_SONG]: [1] } });

    await applyCanonicalIdRemap();
    const first = JSON.stringify({
      offline: useOffline.getState().downloadedTracks,
      collections: useOffline.getState().downloadedCollections,
      queue: useQueue.getState().queue,
      bookmarks: useBookmarks.getState().bookmarks,
    });

    const changed = await applyCanonicalIdRemap();
    const second = JSON.stringify({
      offline: useOffline.getState().downloadedTracks,
      collections: useOffline.getState().downloadedCollections,
      queue: useQueue.getState().queue,
      bookmarks: useBookmarks.getState().bookmarks,
    });

    expect(changed).toBe(0);
    expect(second).toBe(first);
  });
});
