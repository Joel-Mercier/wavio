import {
  DEFAULT_SONG_SORT,
  OFFLINE_SONG_SORT_FIELDS,
  SONG_SORT_FIELDS,
  songSortFields,
  songSortParam,
} from "@/utils/songSort";

const CAN_ALBUM_ARTIST = { songAlbumArtist: true };
const NO_ALBUM_ARTIST = { songAlbumArtist: false };

describe("songSortFields", () => {
  // The whole-library browse is paginated, so its order has to come from the
  // backend. Plain OpenSubsonic browses through an empty-query search3, which
  // takes no sort parameter — offering the control there would sort the fetched
  // pages and then append unsorted rows behind them.
  it("offers nothing on plain OpenSubsonic", () => {
    expect(songSortFields("opensubsonic", CAN_ALBUM_ARTIST, false)).toEqual([]);
    // Not even if a native Navidrome session somehow exists.
    expect(songSortFields("opensubsonic", CAN_ALBUM_ARTIST, true)).toEqual([]);
  });

  it("offers every field on Jellyfin and the local library", () => {
    expect(songSortFields("local", CAN_ALBUM_ARTIST, false)).toEqual(
      SONG_SORT_FIELDS,
    );
    // Jellyfin fills a song's artist from AlbumArtist, so that sort would
    // duplicate the artist one.
    expect(songSortFields("jellyfin", NO_ALBUM_ARTIST, false)).toEqual(
      SONG_SORT_FIELDS.filter((field) => field !== "albumArtist"),
    );
  });

  // Navidrome sorts through its native REST API, which needs the JWT taken at
  // login: without it /api/song answers 401, breaking the browse itself rather
  // than just the sort.
  it("needs a native session on Navidrome", () => {
    expect(songSortFields("navidrome", CAN_ALBUM_ARTIST, true)).toEqual(
      SONG_SORT_FIELDS,
    );
    expect(songSortFields("navidrome", CAN_ALBUM_ARTIST, false)).toEqual([]);
  });
});

describe("songSortParam", () => {
  // The default has to reach the backends (and the query key) as undefined, so
  // an unsorted browse makes exactly the request it made before sorting existed.
  it("is undefined for the backend's own order", () => {
    expect(songSortParam(DEFAULT_SONG_SORT)).toBeUndefined();
    expect(songSortParam("defaultDesc")).toBeUndefined();
    expect(songSortParam("albumDesc")).toBe("albumDesc");
  });
});

describe("OFFLINE_SONG_SORT_FIELDS", () => {
  // A downloaded track carries no library-added date, so that one option can't
  // be honoured client-side.
  it("drops addedAt and keeps the rest", () => {
    expect(OFFLINE_SONG_SORT_FIELDS).toEqual(
      SONG_SORT_FIELDS.filter((field) => field !== "addedAt"),
    );
  });
});
