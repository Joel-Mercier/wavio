import {
  alignTracks,
  flattenReleaseTracks,
  normalizeLoose,
  rankReleases,
  releaseArtistName,
  scoreRelease,
  similarity,
  stripBracketNoise,
} from "@/services/musicbrainz/match";
import { escapeLucene } from "@/services/musicbrainz/search";
import type {
  LocalAlbumCandidate,
  LocalTrackCandidate,
  MbRelease,
} from "@/services/musicbrainz/types";

const localTrack = (
  n: number,
  title: string,
  durationMs: number | null = 200000,
): LocalTrackCandidate => ({
  trackId: `local-track:${n}`,
  title,
  artist: "Portishead",
  trackNumber: n,
  discNumber: 1,
  durationMs,
  artworkPath: null,
});

const localAlbum = (
  tracks: LocalTrackCandidate[],
  overrides: Partial<LocalAlbumCandidate> = {},
): LocalAlbumCandidate => ({
  albumKey: "portishead|dummy",
  album: "Dummy",
  albumArtist: "Portishead",
  year: 1994,
  tracks,
  ...overrides,
});

const mbRelease = (
  titles: { title: string; length?: number | null }[],
  overrides: Partial<MbRelease> = {},
): MbRelease => ({
  id: "release-1",
  title: "Dummy",
  score: 100,
  "artist-credit": [{ artist: { id: "artist-1", name: "Portishead" } }],
  media: [
    {
      position: 1,
      tracks: titles.map((t, i) => ({
        id: `mb-track-${i}`,
        title: t.title,
        position: i + 1,
        length: t.length === undefined ? 200000 : t.length,
      })),
    },
  ],
  ...overrides,
});

describe("normalizeLoose", () => {
  it("strips diacritics, punctuation and casing", () => {
    expect(normalizeLoose("Björk!")).toBe("bjork");
  });

  it("drops a leading article so 'The Beatles' matches 'Beatles'", () => {
    expect(normalizeLoose("The Beatles")).toBe(normalizeLoose("Beatles"));
  });

  it("ignores edition and remaster qualifiers", () => {
    expect(normalizeLoose("Dummy (Remastered)")).toBe(normalizeLoose("Dummy"));
    expect(normalizeLoose("Dummy [Deluxe Edition]")).toBe(
      normalizeLoose("Dummy"),
    );
  });
});

describe("similarity", () => {
  it("returns 1 for equivalent titles and 0 for a missing side", () => {
    expect(similarity("Glory Box", "glory box")).toBe(1);
    expect(similarity(null, "Glory Box")).toBe(0);
  });

  it("scores a typo above an unrelated title", () => {
    expect(similarity("Glory Box", "Glory Bax")).toBeGreaterThan(
      similarity("Glory Box", "Sour Times"),
    );
  });
});

describe("escapeLucene", () => {
  // Inside a quoted phrase only a backslash and a quote are syntax. Escaping
  // anything else (a slash, a hyphen, a bang) inserts a literal backslash into
  // the search term and breaks the phrase.
  it("escapes only what a quoted phrase treats as syntax", () => {
    expect(escapeLucene('Say "Hello"')).toBe('Say \\"Hello\\"');
    expect(escapeLucene("AC\\DC")).toBe("AC\\\\DC");
  });

  it("leaves ordinary punctuation alone", () => {
    expect(escapeLucene("Either/Or")).toBe("Either/Or");
    expect(escapeLucene("!!!")).toBe("!!!");
  });
});

describe("stripBracketNoise", () => {
  // Files ripped from video sites carry packaging junk in the title, which is
  // fatal to a quoted MusicBrainz phrase search.
  it("drops video-site packaging groups", () => {
    expect(stripBracketNoise("Vidage (Official Audio Release)").trim()).toBe(
      "Vidage",
    );
    expect(
      stripBracketNoise("Human (ft. Echoes) [Lyric Visualiser]").trim(),
    ).toBe("Human");
    expect(stripBracketNoise("Song [Official Video]").trim()).toBe("Song");
  });

  it("keeps groups that identify a different recording", () => {
    // These select a real variant, so removing them would match the wrong take.
    expect(stripBracketNoise("Creep (Acoustic)")).toBe("Creep (Acoustic)");
    expect(stripBracketNoise("Blue Monday (Radio Edit)")).toBe(
      "Blue Monday (Radio Edit)",
    );
    expect(stripBracketNoise("Song (Live)")).toBe("Song (Live)");
  });

  it("leaves a title with no brackets untouched", () => {
    expect(stripBracketNoise("Halcyon And On And On")).toBe(
      "Halcyon And On And On",
    );
  });

  // The regression this guards: query building stripped packaging noise but
  // scoring did not, so a correct match scored 0.21 on title and was rejected.
  // Both now go through normalizeLoose, so they agree by construction.
  it("is applied by normalizeLoose, so scoring matches the query", () => {
    expect(normalizeLoose("Vidage (Official Audio Release)")).toBe("vidage");
    expect(similarity("Vidage (Official Audio Release)", "Vidage")).toBe(1);
    expect(similarity("Human (ft. Echoes) [Lyric Visualiser]", "Human")).toBe(
      1,
    );
  });
});

describe("flattenReleaseTracks", () => {
  it("orders across discs and stamps the disc number", () => {
    const release: MbRelease = {
      id: "r",
      title: "Anthology",
      media: [
        {
          position: 2,
          tracks: [{ id: "b", title: "B", position: 1, length: 1000 }],
        },
        {
          position: 1,
          tracks: [{ id: "a", title: "A", position: 1, length: 1000 }],
        },
      ],
    };
    const flat = flattenReleaseTracks(release);
    expect(flat.map((t) => t.title)).toEqual(["A", "B"]);
    expect(flat.map((t) => t.discNumber)).toEqual([1, 2]);
  });
});

describe("alignTracks", () => {
  it("pairs tracks positionally when the running order agrees", () => {
    const local = [localTrack(1, "Mysterons"), localTrack(2, "Sour Times")];
    const mb = flattenReleaseTracks(
      mbRelease([{ title: "Mysterons" }, { title: "Sour Times" }]),
    );
    const aligned = alignTracks(local, mb);
    expect(aligned.map((a) => a.mbTrack?.title)).toEqual([
      "Mysterons",
      "Sour Times",
    ]);
  });

  it("falls back to title matching when the running order differs", () => {
    const local = [localTrack(1, "Sour Times"), localTrack(2, "Mysterons")];
    const mb = flattenReleaseTracks(
      mbRelease([{ title: "Mysterons" }, { title: "Sour Times" }]),
    );
    const aligned = alignTracks(local, mb);
    expect(aligned.map((a) => a.mbTrack?.title)).toEqual([
      "Sour Times",
      "Mysterons",
    ]);
  });

  it("leaves a local track unmatched when nothing corresponds", () => {
    const local = [localTrack(1, "Mysterons"), localTrack(2, "Hidden Bonus")];
    const mb = flattenReleaseTracks(mbRelease([{ title: "Mysterons" }]));
    const aligned = alignTracks(local, mb);
    expect(aligned[1].mbTrack).toBeNull();
  });

  it("reports the duration delta between paired tracks", () => {
    const local = [localTrack(1, "Mysterons", 200000)];
    const mb = flattenReleaseTracks(
      mbRelease([{ title: "Mysterons", length: 201500 }]),
    );
    expect(alignTracks(local, mb)[0].durationDeltaMs).toBe(1500);
  });
});

describe("scoreRelease", () => {
  it("scores an exact album match very high", () => {
    const local = localAlbum([
      localTrack(1, "Mysterons"),
      localTrack(2, "Sour Times"),
    ]);
    const match = scoreRelease(
      local,
      mbRelease([{ title: "Mysterons" }, { title: "Sour Times" }]),
    );
    expect(match.confidence).toBeGreaterThan(0.95);
    expect(match.breakdown.trackCount).toBe(1);
    expect(match.breakdown.duration).toBe(1);
  });

  it("penalises a release with the wrong track count", () => {
    const local = localAlbum([
      localTrack(1, "Mysterons"),
      localTrack(2, "Sour Times"),
    ]);
    const exact = scoreRelease(
      local,
      mbRelease([{ title: "Mysterons" }, { title: "Sour Times" }]),
    );
    const boxSet = scoreRelease(
      local,
      mbRelease([
        { title: "Mysterons" },
        { title: "Sour Times" },
        { title: "Strangers" },
        { title: "It Could Be Sweet" },
      ]),
    );
    expect(boxSet.confidence).toBeLessThan(exact.confidence);
    expect(boxSet.breakdown.trackCount).toBeLessThan(1);
  });

  it("penalises a release whose durations disagree", () => {
    const local = localAlbum([localTrack(1, "Mysterons", 200000)]);
    const match = scoreRelease(
      local,
      mbRelease([{ title: "Mysterons", length: 400000 }]),
    );
    expect(match.breakdown.duration).toBe(0);
  });

  it("stays neutral rather than punishing when durations are unknown", () => {
    const local = localAlbum([localTrack(1, "Mysterons", null)]);
    const match = scoreRelease(
      local,
      mbRelease([{ title: "Mysterons", length: null }]),
    );
    expect(match.breakdown.duration).toBe(0.6);
  });

  it("stays neutral when the local album has no album artist tagged", () => {
    const local = localAlbum([localTrack(1, "Mysterons")], {
      albumArtist: null,
    });
    expect(
      scoreRelease(local, mbRelease([{ title: "Mysterons" }])).breakdown.artist,
    ).toBe(0.6);
  });

  it("scores a wrong album low", () => {
    const local = localAlbum([
      localTrack(1, "Mysterons"),
      localTrack(2, "Sour Times"),
    ]);
    const match = scoreRelease(
      local,
      mbRelease([{ title: "Blue Monday" }, { title: "The Beach" }], {
        id: "other",
        title: "Power, Corruption & Lies",
        score: 40,
        "artist-credit": [{ artist: { id: "a2", name: "New Order" } }],
      }),
    );
    expect(match.confidence).toBeLessThan(0.5);
  });
});

describe("rankReleases", () => {
  it("puts the best candidate first", () => {
    const local = localAlbum([
      localTrack(1, "Mysterons"),
      localTrack(2, "Sour Times"),
    ]);
    const ranked = rankReleases(local, [
      mbRelease([{ title: "Blue Monday" }], {
        id: "wrong",
        title: "Substance",
        score: 60,
        "artist-credit": [{ artist: { id: "a2", name: "New Order" } }],
      }),
      mbRelease([{ title: "Mysterons" }, { title: "Sour Times" }]),
    ]);
    expect(ranked[0].release.id).toBe("release-1");
    expect(ranked[0].confidence).toBeGreaterThan(ranked[1].confidence);
  });
});

describe("releaseArtistName", () => {
  it("joins a multi-artist credit with its join phrases", () => {
    const release: MbRelease = {
      id: "r",
      title: "Collab",
      "artist-credit": [
        { artist: { id: "1", name: "Portishead" }, joinphrase: " & " },
        { artist: { id: "2", name: "Massive Attack" } },
      ],
    };
    expect(releaseArtistName(release)).toBe("Portishead & Massive Attack");
  });
});
