// The local mapper reads star/rating state from the localLibrary store; stub it
// so the mapper can run without MMKV-backed storage.
jest.mock("@/stores/localLibrary", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      favoriteTracks: {},
      favoriteAlbums: {},
      favoriteArtists: {},
      ratings: {},
    }),
  },
}));

// The mapper localizes its "Unknown" fallbacks via the i18n instance; stub it so
// the test doesn't pull the full i18n/zod ESM graph (which jest can't transform).
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: {
    t: (key: string) =>
      ({
        "app.shared.unknown": "Unknown",
        "app.shared.unknownAlbum": "Unknown album",
        "app.shared.unknownArtist": "Unknown artist",
        "app.shared.unknownEpisode": "Unknown episode",
      })[key] ?? key,
  },
}));

import type { TrackRow } from "@/services/local/db";
import { mapRowToChild } from "@/services/local/mappers";

// A random MP3 with no tags and no embedded art — the case that crashed the app.
const bareRow: TrackRow = {
  id: "local-track:abc",
  uri: "file:///music/song.mp3",
  path: "/music/song.mp3",
  folder: "/music",
  size: null,
  mtime: null,
  title: null,
  artist: null,
  album: null,
  album_artist: null,
  composer: null,
  genre: null,
  year: null,
  track_number: null,
  track_total: null,
  disc_number: null,
  disc_total: null,
  duration_ms: null,
  bitrate: null,
  sample_rate: null,
  is_compilation: 0,
  suffix: null,
  artwork_path: null,
  artwork_mime: null,
  lyrics: null,
  music_brainz_id: null,
  artists_json: null,
  replay_gain_json: null,
  album_key: null,
  artist_key: null,
  indexed_at: 0,
  play_count: 0,
  last_played_at: null,
};

describe("local mapRowToChild with missing metadata", () => {
  it("maps a fully tagless row without throwing", () => {
    expect(() => mapRowToChild(bareRow)).not.toThrow();
  });

  it("falls back to a safe title and leaves optional fields undefined", () => {
    const child = mapRowToChild(bareRow);
    expect(child.title).toBe("Unknown");
    expect(child.artist).toBeUndefined();
    expect(child.album).toBeUndefined();
    // No embedded art → coverArt must be undefined, never "" (an empty string
    // would later be parsed into a java.net.URL by the lock screen and crash).
    expect(child.coverArt).toBeUndefined();
    expect(child.duration).toBeUndefined();
  });
});
