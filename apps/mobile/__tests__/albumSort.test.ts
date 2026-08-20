import type { AlbumID3 } from "@/services/openSubsonic/types";
import {
  ALBUM_SORT_COVERAGE_FIELDS,
  ALBUM_SORT_FIELDS,
  ALBUM_SORT_SPECS,
  albumLockedDirections,
  albumOrderSupported,
  albumSortListType,
  albumSortParams,
  availableAlbumSortFields,
  DEFAULT_ALBUM_SORT,
  OFFLINE_ALBUM_SORT_FIELDS,
  resolveAlbumSort,
} from "@/utils/albumSort";
import { sortItems } from "@/utils/sort";

describe("albumSortParams", () => {
  // The browse the screen already did before it could sort, so the request and
  // the react-query key have to come out byte-identical.
  it("keeps the default an unadorned alphabeticalByName browse", () => {
    expect(albumSortParams(DEFAULT_ALBUM_SORT)).toEqual({
      type: "alphabeticalByName",
    });
  });

  // getAlbumList2 has no sort-order parameter, so `order` is only meaningful
  // when it contradicts the direction the type already serves. Leaving it off
  // otherwise is what keeps a natural-direction browse on the Subsonic surface.
  it("omits order for a type's natural direction", () => {
    expect(albumSortParams("addedAtDesc")).toEqual({ type: "newest" });
    expect(albumSortParams("playCountDesc")).toEqual({ type: "frequent" });
    expect(albumSortParams("yearAsc")).toEqual({ type: "byYear" });
  });

  it("sets order only for a reversed browse", () => {
    expect(albumSortParams("alphabeticalDesc")).toEqual({
      type: "alphabeticalByName",
      order: "desc",
    });
    expect(albumSortParams("addedAtAsc")).toEqual({
      type: "newest",
      order: "asc",
    });
    expect(albumSortParams("yearDesc")).toEqual({
      type: "byYear",
      order: "desc",
    });
  });

  it("maps every field to an album-list type", () => {
    for (const field of ALBUM_SORT_FIELDS) {
      expect(albumSortParams(`${field}Asc`).type).toBeTruthy();
    }
  });
});

describe("availableAlbumSortFields", () => {
  // The whole point: a fresh server has played and rated nothing, so
  // getAlbumList2 answers frequent/recent/highest with an empty list. Offering
  // those rows sends a full library to EmptyDisplay.
  it("drops the fields the library has no data for", () => {
    expect(
      availableAlbumSortFields({
        playCount: false,
        lastPlayed: false,
        rating: false,
      }),
    ).toEqual(["alphabetical", "artist", "addedAt", "year", "random"]);
  });

  // A paused or failed probe reads as unknown, not as "no data" — an offline
  // browse or a server that errors must not silently lose rows.
  it("keeps a field whose coverage is unknown", () => {
    expect(availableAlbumSortFields({})).toEqual(ALBUM_SORT_FIELDS);
    expect(availableAlbumSortFields({ rating: undefined })).toEqual(
      ALBUM_SORT_FIELDS,
    );
  });

  it("keeps a field the library does have data for", () => {
    expect(
      availableAlbumSortFields({
        playCount: true,
        lastPlayed: false,
        rating: false,
      }),
    ).toContain("playCount");
  });

  // Only these three depend on user activity; the rest are always answerable,
  // so probing them would be three wasted requests.
  it("probes exactly the activity-dependent album-list types", () => {
    expect(ALBUM_SORT_COVERAGE_FIELDS.map(albumSortListType)).toEqual([
      "frequent",
      "recent",
      "highest",
    ]);
  });
});

describe("albumOrderSupported", () => {
  // Jellyfin has Items SortOrder and the local library an ORDER BY direction;
  // Navidrome needs the native JWT taken at login, and the Subsonic surface has
  // no order parameter at all.
  it("is true only where the backend takes a sort order", () => {
    expect(albumOrderSupported("jellyfin", false)).toBe(true);
    expect(albumOrderSupported("local", false)).toBe(true);
    expect(albumOrderSupported("navidrome", true)).toBe(true);
    expect(albumOrderSupported("navidrome", false)).toBe(false);
    expect(albumOrderSupported("opensubsonic", true)).toBe(false);
  });
});

describe("albumLockedDirections", () => {
  it("locks only random where the backend can reverse", () => {
    expect(albumLockedDirections("jellyfin", false)).toEqual({
      random: "none",
    });
  });

  // byYear stays unlocked everywhere: it reverses on the Subsonic surface too,
  // by swapping the year bounds.
  it("pins every field but year on a backend with no order param", () => {
    const locked = albumLockedDirections("opensubsonic", false);
    expect(locked.year).toBeUndefined();
    expect(locked.random).toBe("none");
    expect(locked.alphabetical).toBe("asc");
    expect(locked.artist).toBe("asc");
    expect(locked.addedAt).toBe("desc");
    expect(locked.playCount).toBe("desc");
    expect(locked.lastPlayed).toBe("desc");
    expect(locked.rating).toBe("desc");
  });

  it("treats Navidrome without a native session like plain OpenSubsonic", () => {
    expect(albumLockedDirections("navidrome", false)).toEqual(
      albumLockedDirections("opensubsonic", false),
    );
  });
});

describe("resolveAlbumSort", () => {
  const subsonic = albumLockedDirections("opensubsonic", false);

  // A preference saved on a server that can reverse must not produce a request
  // this one can't honour — snapped back rather than trusted.
  it("snaps a locked field to its allowed direction", () => {
    expect(resolveAlbumSort("alphabeticalDesc", subsonic)).toBe(
      "alphabeticalAsc",
    );
    expect(resolveAlbumSort("addedAtAsc", subsonic)).toBe("addedAtDesc");
  });

  it("leaves unlocked fields alone", () => {
    expect(resolveAlbumSort("yearDesc", subsonic)).toBe("yearDesc");
    expect(resolveAlbumSort("alphabeticalDesc", { random: "none" })).toBe(
      "alphabeticalDesc",
    );
  });

  it("gives the direction-less random field a stable value", () => {
    expect(resolveAlbumSort("randomDesc", subsonic)).toBe("randomAsc");
  });
});

describe("OFFLINE_ALBUM_SORT_FIELDS", () => {
  // A random order is a backend order, not a value read off the items.
  it("drops random and keeps the rest", () => {
    expect(OFFLINE_ALBUM_SORT_FIELDS).toEqual(
      ALBUM_SORT_FIELDS.filter((field) => field !== "random"),
    );
  });
});

describe("ALBUM_SORT_SPECS", () => {
  const album = (partial: Partial<AlbumID3> & { id: string }): AlbumID3 => ({
    name: partial.id,
    songCount: 0,
    duration: 0,
    created: new Date(0),
    ...partial,
  });

  it("sorts by year with missing years pinned last in both directions", () => {
    const albums = [
      album({ id: "none" }),
      album({ id: "old", year: 1990 }),
      album({ id: "new", year: 2020 }),
    ];
    expect(
      sortItems(albums, "yearAsc", ALBUM_SORT_SPECS).map((a) => a.id),
    ).toEqual(["old", "new", "none"]);
    expect(
      sortItems(albums, "yearDesc", ALBUM_SORT_SPECS).map((a) => a.id),
    ).toEqual(["new", "old", "none"]);
  });

  // `created` / `played` are typed as Dates but only the local library builds
  // one — every JSON backend hands back the raw ISO string, so both shapes have
  // to sort.
  it("sorts by date whether the backend gave a Date or an ISO string", () => {
    const albums = [
      album({
        id: "old",
        created: "2024-01-01T00:00:00Z" as unknown as Date,
        played: "2024-06-01T00:00:00Z" as unknown as Date,
      }),
      album({ id: "never", created: undefined }),
      album({
        id: "new",
        created: new Date("2026-01-01"),
        played: new Date("2026-06-01"),
      }),
    ];
    expect(
      sortItems(albums, "addedAtDesc", ALBUM_SORT_SPECS).map((a) => a.id),
    ).toEqual(["new", "old", "never"]);
    expect(
      sortItems(albums, "lastPlayedAsc", ALBUM_SORT_SPECS).map((a) => a.id),
    ).toEqual(["old", "new", "never"]);
  });

  // A downloaded collection carries no play count, so the option has to
  // disappear rather than sort everything into one tie.
  it("treats a zero play count as no data", () => {
    const albums = [album({ id: "a", playCount: 0 })];
    expect(
      sortItems(albums, "playCountDesc", ALBUM_SORT_SPECS).map((a) => a.id),
    ).toEqual(["a"]);
    expect(ALBUM_SORT_SPECS.playCount.zeroIsEmpty).toBe(true);
  });
});
