import {
  artistMatchKeys,
  filterHidden,
  filterHiddenFromStart,
  type HiddenIndex,
  hiddenReason,
} from "@/services/hiddenTracks/match";
import { localArtistId } from "@/services/local/keys";

const index = (partial: Partial<HiddenIndex> = {}): HiddenIndex => ({
  tracks: {},
  artists: {},
  allowed: {},
  ...partial,
});

describe("artistMatchKeys", () => {
  it("matches every track artist and artistId on Subsonic backends", () => {
    const track = {
      id: "t1",
      artistId: "a1",
      artists: [
        { id: "a1", name: "Main" },
        { id: "a2", name: "Guest" },
      ],
    };
    expect(artistMatchKeys(track, "navidrome")).toEqual(["a1", "a2", "a1"]);
    expect(
      artistMatchKeys({ id: "t", artistId: "a9" }, "opensubsonic"),
    ).toEqual(["a9"]);
  });

  it("matches Jellyfin's album artist alongside its unsplit track artists", () => {
    const track = {
      id: "t1",
      artistId: "bicep",
      artists: [{ id: "bicep-feat", name: "Bicep feat. Clara La San" }],
    };
    expect(artistMatchKeys(track, "jellyfin")).toEqual(["bicep-feat", "bicep"]);
    expect(
      hiddenReason(index({ artists: { bicep: {} } }), track, "jellyfin"),
    ).toBe("artist");
    expect(artistMatchKeys({ id: "t", artistId: "solo" }, "jellyfin")).toEqual([
      "solo",
    ]);
  });

  it.each(["local", "smb", "webdav"] as const)(
    "matches the album-artist group and each named artist on %s",
    (serverType) => {
      const group = localArtistId("daft punk");
      const track = {
        id: "t1",
        artistId: group,
        artists: [
          { id: group, name: "Daft Punk" },
          { id: group, name: "Pharrell  Williams" },
        ],
      };
      expect(artistMatchKeys(track, serverType)).toEqual([
        group,
        localArtistId("daft punk"),
        localArtistId("pharrell williams"),
      ]);
    },
  );

  it("falls back to the artist string on an index-backed track", () => {
    expect(artistMatchKeys({ id: "t", artist: "Solo Act" }, "local")).toEqual([
      localArtistId("solo act"),
    ]);
  });
});

describe("hiddenReason", () => {
  const track = { id: "t1", artistId: "a1", artists: [{ id: "a1" }] };

  it("is null with nothing hidden", () => {
    expect(hiddenReason(index(), track, "navidrome")).toBeNull();
  });

  it("reports a directly hidden track", () => {
    expect(
      hiddenReason(index({ tracks: { t1: {} } }), track, "navidrome"),
    ).toBe("track");
  });

  it("reports a track by a blocked artist", () => {
    expect(
      hiddenReason(index({ artists: { a1: {} } }), track, "navidrome"),
    ).toBe("artist");
  });

  it("lets an allowed track through an artist block, not a direct hide", () => {
    expect(
      hiddenReason(
        index({ artists: { a1: {} }, allowed: { t1: { artistKeys: ["a1"] } } }),
        track,
        "navidrome",
      ),
    ).toBeNull();
    expect(
      hiddenReason(
        index({ tracks: { t1: {} }, allowed: { t1: { artistKeys: ["a1"] } } }),
        track,
        "navidrome",
      ),
    ).toBe("track");
  });

  it("keeps an exception to the blocks it was granted against", () => {
    const featuring = {
      id: "t1",
      artistId: "a1",
      artists: [{ id: "a1" }, { id: "a2" }],
    };
    expect(
      hiddenReason(
        index({
          artists: { a1: {}, a2: {} },
          allowed: { t1: { artistKeys: ["a1"] } },
        }),
        featuring,
        "navidrome",
      ),
    ).toBe("artist");
  });

  it("never hides radio, podcast or audiobook items", () => {
    const blocked = index({ artists: { [localArtistId("host")]: {} } });
    for (const item of [
      { id: "r", artist: "Host", isRadio: true },
      { id: "p", artist: "Host", source: "podcast" },
      { id: "b", artist: "Host", source: "audiobook" },
    ]) {
      expect(hiddenReason(blocked, item, "local")).toBeNull();
    }
  });

  it("does not treat prototype keys as hidden", () => {
    expect(
      hiddenReason(index(), { id: "constructor" }, "navidrome"),
    ).toBeNull();
  });
});

describe("filterHidden", () => {
  const tracks = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns the same array when nothing is hidden", () => {
    expect(filterHidden(tracks, index(), "navidrome")).toBe(tracks);
    expect(
      filterHidden(tracks, index({ tracks: { zzz: {} } }), "navidrome"),
    ).toBe(tracks);
  });

  it("drops hidden tracks", () => {
    expect(
      filterHidden(tracks, index({ tracks: { b: {} } }), "navidrome"),
    ).toEqual([{ id: "a" }, { id: "c" }]);
  });
});

describe("filterHiddenFromStart", () => {
  const tracks = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

  it("keeps the tapped track when hidden ones precede it", () => {
    const result = filterHiddenFromStart(
      tracks,
      3,
      index({ tracks: { a: {}, b: {} } }),
      "navidrome",
    );
    expect(result.tracks.map((t) => t.id)).toEqual(["c", "d", "e"]);
    expect(result.tracks[result.startIndex].id).toBe("d");
  });

  it("moves a hidden start onto the next visible track", () => {
    const result = filterHiddenFromStart(
      tracks,
      1,
      index({ tracks: { b: {}, c: {} } }),
      "navidrome",
    );
    expect(result.tracks[result.startIndex].id).toBe("d");
  });

  it("falls back to the last visible track when none follow", () => {
    const result = filterHiddenFromStart(
      tracks,
      3,
      index({ tracks: { d: {}, e: {} } }),
      "navidrome",
    );
    expect(result.tracks[result.startIndex].id).toBe("c");
  });

  it("returns an empty list when everything is hidden", () => {
    const result = filterHiddenFromStart(
      tracks,
      0,
      index({ tracks: { a: {}, b: {}, c: {}, d: {}, e: {} } }),
      "navidrome",
    );
    expect(result.tracks).toEqual([]);
  });
});
