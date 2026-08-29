// Offline, the player is the only screen that renders a *track*-level cover id.
// Every list and detail screen renders the album's, so expo-image's URL-keyed
// disk cache holds album covers from earlier browsing and holds nothing for the
// track id — which is why the player, and only the player, lost its artwork.

const mockAuth = {
  url: "https://music.example",
  serverType: "navidrome" as string,
  username: "joel",
  password: "hunter2",
  subsonicSalt: "",
  subsonicToken: "",
  useTokenAuth: false,
};

// utils/artwork reaches MMKV through the jellyfin device id on import.
jest.mock("@/config/storage", () => ({
  storage: { set: () => {}, getString: () => null, remove: () => {} },
  zustandStorage: {
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {},
  },
}));

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => mockAuth },
}));

// Pulls stores/app, and with it the i18n/zod chain; this suite is navidrome.
jest.mock("@/services/jellyfin/streaming", () => ({
  artworkUrl: () => "",
}));

jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => false,
}));

jest.mock("@/stores/offline", () => ({
  __esModule: true,
  default: { getState: () => ({ artworkCache: {}, artworkAliases: {} }) },
}));

import { resolveOfflineTrackArtwork } from "@/utils/artwork";

// Navidrome cover ids carry an updated-at token; the offline cache is keyed by
// the entity part alone (artworkCacheKey).
const ALBUM_COVER_ID = "al-abc_68e67692";
const ALBUM_COVER_KEY = "al-abc";
const TRACK_COVER_ID = "mf-xyz_68e67692";

const track = {
  artwork: `https://music.example/rest/getCoverArt?id=${TRACK_COVER_ID}`,
  coverArt: TRACK_COVER_ID,
  albumId: "abc",
};

const maps = (
  over: Partial<Parameters<typeof resolveOfflineTrackArtwork>[1]>,
) => ({
  artworkCache: {},
  artworkAliases: {},
  downloadedCollections: {},
  ...over,
});

describe("resolveOfflineTrackArtwork", () => {
  it("follows the mf- → al- alias to the cached album cover", () => {
    expect(
      resolveOfflineTrackArtwork(
        track,
        maps({
          artworkCache: { [ALBUM_COVER_KEY]: "file:///art/al-abc_1.jpg" },
          artworkAliases: { "mf-xyz": ALBUM_COVER_KEY },
        }),
      ),
    ).toBe("file:///art/al-abc_1.jpg");
  });

  // The regression: a collection stores the raw `al-abc_68e67692`, the cache is
  // keyed `al-abc`, so indexing the cache with the collection's id verbatim
  // missed on every Navidrome album — the exact backend the backstop exists for.
  it("matches a cached album cover whose collection id still carries its token", () => {
    expect(
      resolveOfflineTrackArtwork(
        track,
        maps({
          artworkCache: { [ALBUM_COVER_KEY]: "file:///art/al-abc_1.jpg" },
          downloadedCollections: { abc: { coverArt: ALBUM_COVER_ID } },
        }),
      ),
    ).toBe("file:///art/al-abc_1.jpg");
  });

  // Nothing cached to disk: hand back the URL the album screens render, which
  // expo-image is holding, rather than the track URL nothing ever requested.
  it("falls back to the album's cover URL, not the track's", () => {
    const resolved = resolveOfflineTrackArtwork(
      track,
      maps({ downloadedCollections: { abc: { coverArt: ALBUM_COVER_ID } } }),
    );
    expect(resolved).toContain(encodeURIComponent(ALBUM_COVER_ID));
    expect(resolved).not.toContain(encodeURIComponent(TRACK_COVER_ID));
  });

  it("keeps the track's own artwork when no album cover is known", () => {
    expect(resolveOfflineTrackArtwork(track, maps({}))).toBe(track.artwork);
  });

  it("prefers a cover cached for the track id itself over the album's", () => {
    expect(
      resolveOfflineTrackArtwork(
        track,
        maps({
          artworkCache: {
            "mf-xyz": "file:///art/mf-xyz_1.jpg",
            [ALBUM_COVER_KEY]: "file:///art/al-abc_1.jpg",
          },
        }),
      ),
    ).toBe("file:///art/mf-xyz_1.jpg");
  });
});
