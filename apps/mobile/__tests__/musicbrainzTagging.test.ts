import {
  pickCanonicalRelease,
  rankRecordings,
  scoreRelease,
} from "@/services/musicbrainz/match";
import {
  ALL_TAG_FIELDS,
  buildRecordingProposal,
  buildTrackProposals,
  isNoOp,
  parseYear,
  type TagField,
  type TrackProposal,
} from "@/services/musicbrainz/tagging";
import type {
  LocalAlbumCandidate,
  MbRecording,
  MbRelease,
  MbTrack,
} from "@/services/musicbrainz/types";

/**
 * The album key the `tracks_resolved` view reads back: the override when there
 * is one, otherwise the scanned key. A null override means "no correction", so
 * asserting on this rather than on the raw column is what actually pins down
 * where a track ends up grouped.
 */
const resolvedAlbumKey = (
  override: TrackProposal["override"],
  scanned: string,
): string => override.album_key ?? scanned;

const LOCAL: LocalAlbumCandidate = {
  albumKey: "dumy portished",
  album: "Dumy",
  albumArtist: "Portished",
  year: 1993,
  tracks: [
    {
      trackId: "local-track:1",
      title: "mysterons",
      artist: "Portished",
      trackNumber: 1,
      discNumber: 1,
      durationMs: 302000,
      artworkPath: null,
    },
    {
      trackId: "local-track:2",
      title: "sour times",
      artist: "Portished",
      trackNumber: 2,
      discNumber: 1,
      durationMs: 254000,
      artworkPath: null,
    },
  ],
};

const RELEASE: MbRelease = {
  id: "release-1",
  title: "Dummy",
  date: "1994-08-22",
  score: 100,
  "artist-credit": [{ artist: { id: "artist-1", name: "Portishead" } }],
  "release-group": {
    id: "rg-1",
    title: "Dummy",
    "first-release-date": "1994-08-22",
  },
  media: [
    {
      position: 1,
      tracks: [
        {
          id: "t1",
          title: "Mysterons",
          position: 1,
          length: 302000,
          recording: { id: "rec-1", title: "Mysterons" },
        },
        {
          id: "t2",
          title: "Sour Times",
          position: 2,
          length: 254000,
          recording: { id: "rec-2", title: "Sour Times" },
        },
      ],
    },
  ],
};

const proposalsFor = (fields?: TagField[]) =>
  buildTrackProposals(LOCAL, scoreRelease(LOCAL, RELEASE), fields);

describe("parseYear", () => {
  it("reads the year out of a MusicBrainz date", () => {
    expect(parseYear("1994-08-22")).toBe(1994);
    expect(parseYear("1994")).toBe(1994);
    expect(parseYear(undefined)).toBeNull();
    expect(parseYear("")).toBeNull();
  });
});

describe("buildTrackProposals", () => {
  it("proposes the corrected tags for every aligned track", () => {
    const proposals = proposalsFor();
    expect(proposals).toHaveLength(2);
    expect(proposals[0].override.title).toBe("Mysterons");
    expect(proposals[0].override.album).toBe("Dummy");
    expect(proposals[0].override.album_artist).toBe("Portishead");
    expect(proposals[0].override.year).toBe(1994);
    expect(proposals[1].override.track_number).toBe(2);
  });

  it("carries the MusicBrainz identifiers through", () => {
    const { override } = proposalsFor()[0];
    expect(override.mb_recording_id).toBe("rec-1");
    expect(override.music_brainz_id).toBe("rec-1");
    expect(override.mb_release_id).toBe("release-1");
    expect(override.mb_release_group_id).toBe("rg-1");
    expect(override.mb_artist_id).toBe("artist-1");
  });

  it("recomputes the grouping keys from the corrected names", () => {
    const { override } = proposalsFor()[0];
    expect(override.album_key).toBe("dummy portishead");
    expect(override.artist_key).toBe("portishead");
  });

  it("keys off the scanned names for fields the user deselected", () => {
    // Album is not being corrected, so the album must stay grouped under its
    // existing (misspelled) key or it would split into a second album. A null
    // key override is how that's expressed: the view reads it as "no
    // correction" and falls back to the scanned key.
    const { override } = proposalsFor(["title"])[0];
    expect(resolvedAlbumKey(override, LOCAL.albumKey)).toBe("dumy portished");
    expect(override.album_key).toBeNull();
    expect(override.album).toBeNull();
    expect(override.title).toBe("Mysterons");
  });

  it("gives every track of an album-artist-less album the same key", () => {
    // The grouping key must be derived from album-level values only. Falling
    // back to the per-track artist (as albumKey() does) would give each track
    // of a compilation its own key and scatter the album on apply.
    const compilation: LocalAlbumCandidate = {
      ...LOCAL,
      albumArtist: null,
      tracks: [
        { ...LOCAL.tracks[0], artist: "Beth Gibbons" },
        { ...LOCAL.tracks[1], artist: "Geoff Barrow" },
      ],
    };
    const proposals = buildTrackProposals(
      compilation,
      scoreRelease(compilation, RELEASE),
    );
    const keys = new Set(
      proposals.map((p) => resolvedAlbumKey(p.override, compilation.albumKey)),
    );
    expect(keys.size).toBe(1);
  });

  it("writes null for deselected fields so they fall back to the scanned tag", () => {
    const { override } = proposalsFor(["title"])[0];
    expect(override.artist).toBeNull();
    expect(override.year).toBeNull();
    expect(override.track_number).toBeNull();
    expect(override.disc_number).toBeNull();
  });

  it("reports a diff only for fields that actually change", () => {
    const diffs = proposalsFor()[0].diffs;
    expect(diffs.map((d) => d.field).sort()).toEqual([
      "album",
      "albumArtist",
      "artist",
      // These fixtures carry no embedded artwork, so a cover is offered too.
      "coverArt",
      "title",
      "year",
    ]);
    // Track and disc numbers already matched, so they are not offered as changes.
    expect(diffs.find((d) => d.field === "trackNumber")).toBeUndefined();
  });

  it("skips local tracks that found no counterpart", () => {
    const partial: LocalAlbumCandidate = {
      ...LOCAL,
      tracks: [
        ...LOCAL.tracks,
        {
          trackId: "local-track:3",
          title: "Untitled Hidden Track",
          artist: "Portished",
          trackNumber: 3,
          discNumber: 1,
          durationMs: 60000,
          artworkPath: null,
        },
      ],
    };
    const proposals = buildTrackProposals(
      partial,
      scoreRelease(partial, RELEASE),
    );
    expect(proposals.map((p) => p.local.trackId)).toEqual([
      "local-track:1",
      "local-track:2",
    ]);
  });

  it("stores multi-artist credits as a name array", () => {
    const collab: MbRelease = {
      ...RELEASE,
      media: [
        {
          position: 1,
          tracks: [
            {
              id: "t1",
              title: "Mysterons",
              position: 1,
              length: 302000,
              recording: { id: "rec-1", title: "Mysterons" },
              "artist-credit": [
                {
                  artist: { id: "a1", name: "Portishead" },
                  joinphrase: " & ",
                },
                { artist: { id: "a2", name: "Massive Attack" } },
              ],
            },
          ],
        },
      ],
    };
    const single: LocalAlbumCandidate = {
      ...LOCAL,
      tracks: [LOCAL.tracks[0]],
    };
    const { override } = buildTrackProposals(
      single,
      scoreRelease(single, collab),
    )[0];
    expect(override.artist).toBe("Portishead & Massive Attack");
    expect(JSON.parse(override.artists_json as string)).toEqual([
      "Portishead",
      "Massive Attack",
    ]);
  });

  it("leaves artists_json null for a single-artist credit", () => {
    expect(proposalsFor()[0].override.artists_json).toBeNull();
  });
});

describe("cover art", () => {
  const withArtwork = (artworkPath: string | null): LocalAlbumCandidate => ({
    ...LOCAL,
    tracks: LOCAL.tracks.map((track) => ({ ...track, artworkPath })),
  });

  const coverDiff = (album: LocalAlbumCandidate, fields?: TagField[]) =>
    buildTrackProposals(
      album,
      scoreRelease(album, RELEASE),
      fields,
    )[0].diffs.find((d) => d.field === "coverArt");

  it("offers a cover for a track that has none", () => {
    expect(coverDiff(withArtwork(null))).toBeDefined();
  });

  it("leaves artwork already embedded in the file alone", () => {
    // A present cover is rarely *wrong*, unlike a bad title — replacing it is a
    // change the user didn't ask for.
    expect(coverDiff(withArtwork("/art/existing.jpg"))).toBeUndefined();
  });

  it("offers nothing when the field is deselected", () => {
    expect(coverDiff(withArtwork(null), ["title"])).toBeUndefined();
  });

  it("counts as a change, so an otherwise-correct album is not a no-op", () => {
    const correctButCoverless: LocalAlbumCandidate = {
      albumKey: "dummy portishead",
      album: "Dummy",
      albumArtist: "Portishead",
      year: 1994,
      tracks: [
        {
          trackId: "local-track:1",
          title: "Mysterons",
          artist: "Portishead",
          trackNumber: 1,
          discNumber: 1,
          durationMs: 302000,
          artworkPath: null,
        },
        {
          trackId: "local-track:2",
          title: "Sour Times",
          artist: "Portishead",
          trackNumber: 2,
          discNumber: 1,
          durationMs: 254000,
          artworkPath: null,
        },
      ],
    };
    const proposals = buildTrackProposals(
      correctButCoverless,
      scoreRelease(correctButCoverless, RELEASE),
    );
    expect(isNoOp(proposals)).toBe(false);
  });
});

describe("isNoOp", () => {
  it("is true when the local tags already match MusicBrainz", () => {
    const correct: LocalAlbumCandidate = {
      albumKey: "dummy portishead",
      album: "Dummy",
      albumArtist: "Portishead",
      year: 1994,
      tracks: [
        {
          trackId: "local-track:1",
          title: "Mysterons",
          artist: "Portishead",
          trackNumber: 1,
          discNumber: 1,
          durationMs: 302000,
          artworkPath: "/art/a.jpg",
        },
        {
          trackId: "local-track:2",
          title: "Sour Times",
          artist: "Portishead",
          trackNumber: 2,
          discNumber: 1,
          durationMs: 254000,
          artworkPath: "/art/a.jpg",
        },
      ],
    };
    const proposals = buildTrackProposals(
      correct,
      scoreRelease(correct, RELEASE),
    );
    expect(isNoOp(proposals)).toBe(true);
  });

  it("is false when something would change", () => {
    expect(isNoOp(proposalsFor())).toBe(false);
  });
});

describe("loose-track (recording) matching", () => {
  const looseTrack = {
    trackId: "local-track:1",
    title: "creep",
    artist: "radiohead",
    trackNumber: null,
    discNumber: null,
    durationMs: 238000,
    artworkPath: null,
  };

  const recording = (overrides: Partial<MbRecording> = {}): MbRecording => ({
    id: "rec-1",
    title: "Creep",
    length: 238000,
    score: 100,
    "artist-credit": [{ artist: { id: "a1", name: "Radiohead" } }],
    releases: [
      {
        id: "rel-studio",
        title: "Pablo Honey",
        date: "1993-02-22",
        status: "Official",
        "release-group": { id: "rg-1", "primary-type": "Album" },
        media: [{ position: 1, track: [{ number: "2", position: 2 }] }],
      },
    ],
    ...overrides,
  });

  it("prefers a studio album over a live or compilation release", () => {
    const withBootlegs = recording({
      releases: [
        {
          id: "rel-live",
          title: "Live at Glasgow",
          date: "1992-01-01",
          status: "Bootleg",
          "release-group": {
            id: "rg-live",
            "primary-type": "Album",
            "secondary-types": ["Live"],
          },
        },
        {
          id: "rel-comp",
          title: "Some Compilation",
          date: "1991-01-01",
          status: "Official",
          "release-group": {
            id: "rg-comp",
            "primary-type": "Album",
            "secondary-types": ["Compilation"],
          },
        },
        {
          id: "rel-studio",
          title: "Pablo Honey",
          date: "1993-02-22",
          status: "Official",
          "release-group": { id: "rg-1", "primary-type": "Album" },
        },
      ],
    });
    expect(pickCanonicalRelease(withBootlegs)?.id).toBe("rel-studio");
  });

  it("attributes no album at all rather than a bootleg", () => {
    // Verified against the live API: falling back to "the earliest release"
    // produced attributions like Creep -> "Towering Above the Rest". Correcting
    // only title and artist is the better outcome.
    const onlyLive = recording({
      releases: [
        {
          id: "rel-b",
          title: "Live in Berlin",
          date: "1999",
          status: "Bootleg",
          "release-group": {
            id: "g",
            "primary-type": "Album",
            "secondary-types": ["Live"],
          },
        },
      ],
    });
    expect(pickCanonicalRelease(onlyLive)).toBeNull();
  });

  it("rejects a Various Artists release even when typed as a studio album", () => {
    const va = recording({
      releases: [
        {
          id: "rel-va",
          title: "Now That's What I Call Music",
          date: "1995",
          status: "Official",
          "artist-credit": [{ artist: { id: "va", name: "Various Artists" } }],
          "release-group": { id: "g", "primary-type": "Album" },
        },
      ],
    });
    expect(pickCanonicalRelease(va)).toBeNull();
  });

  it("prefers the earliest official studio release over a later reissue", () => {
    const reissued = recording({
      releases: [
        {
          id: "rel-reissue",
          title: "Pablo Honey",
          date: "2009",
          status: "Official",
          "release-group": { id: "g", "primary-type": "Album" },
        },
        {
          id: "rel-original",
          title: "Pablo Honey",
          date: "1993",
          status: "Official",
          "release-group": { id: "g", "primary-type": "Album" },
        },
      ],
    });
    expect(pickCanonicalRelease(reissued)?.id).toBe("rel-original");
  });

  it("ranks the take whose duration matches above a longer live version", () => {
    const ranked = rankRecordings(looseTrack, [
      recording({ id: "live", length: 324000 }),
      recording({ id: "studio", length: 238000 }),
    ]);
    expect(ranked[0].recording.id).toBe("studio");
  });

  it("builds a correction carrying the attributed album and track number", () => {
    const best = rankRecordings(looseTrack, [recording()])[0];
    const { override } = buildRecordingProposal(looseTrack, best);
    expect(override.title).toBe("Creep");
    expect(override.artist).toBe("Radiohead");
    expect(override.album).toBe("Pablo Honey");
    expect(override.year).toBe(1993);
    expect(override.track_number).toBe(2);
    expect(override.mb_recording_id).toBe("rec-1");
    expect(override.mb_release_id).toBe("rel-studio");
  });

  it("keys the corrected track to its newly attributed album", () => {
    const best = rankRecordings(looseTrack, [recording()])[0];
    const { override } = buildRecordingProposal(looseTrack, best);
    expect(override.album_key).toBe("pablo honey radiohead");
    // Already scanned as "radiohead", so there is nothing to correct.
    expect(override.artist_key).toBeNull();
  });

  // Per-recording matching is also the fallback for a real album MusicBrainz
  // didn't return. Each track then resolves to its own release, so anything
  // album-level it proposes would break the album into one album per track.
  describe("when the tracks already form an album", () => {
    const grouping = {
      album: "Pabblo Honey",
      albumArtist: "Radiohead",
      albumKey: "pabblo honey radiohead",
    };

    it("leaves the album grouping alone", () => {
      const best = rankRecordings(looseTrack, [recording()])[0];
      const { override } = buildRecordingProposal(
        looseTrack,
        best,
        ALL_TAG_FIELDS,
        grouping,
      );
      expect(override.album_key).toBeNull();
      expect(override.album).toBeNull();
      expect(override.album_artist).toBeNull();
    });

    it("still corrects the per-track fields", () => {
      const best = rankRecordings(looseTrack, [recording()])[0];
      const { override } = buildRecordingProposal(
        looseTrack,
        best,
        ALL_TAG_FIELDS,
        grouping,
      );
      expect(override.title).toBe("Creep");
      expect(override.artist).toBe("Radiohead");
      expect(override.mb_recording_id).toBe("rec-1");
    });

    it("offers no album diff, so the review screen can't promise one", () => {
      const best = rankRecordings(looseTrack, [recording()])[0];
      const { diffs } = buildRecordingProposal(
        looseTrack,
        best,
        ALL_TAG_FIELDS,
        grouping,
      );
      expect(diffs.map((d) => d.field)).not.toContain("album");
      expect(diffs.map((d) => d.field)).not.toContain("albumArtist");
    });

    it("keeps two differently-attributed tracks in one album", () => {
      const other = { ...looseTrack, trackId: "local-track:2", title: "creep" };
      const best = rankRecordings(looseTrack, [recording()])[0];
      const otherBest = rankRecordings(other, [
        recording({ id: "rec-2", releases: [] }),
      ])[0];
      const keys = [
        buildRecordingProposal(looseTrack, best, ALL_TAG_FIELDS, grouping),
        buildRecordingProposal(other, otherBest, ALL_TAG_FIELDS, grouping),
      ].map((p) => resolvedAlbumKey(p.override, grouping.albumKey));
      expect(new Set(keys).size).toBe(1);
    });
  });

  it("leaves the track number uncorrected when the release has no tracklist", () => {
    const noTracklist = recording({
      releases: [
        {
          id: "r",
          title: "Pablo Honey",
          date: "1993",
          "release-group": { id: "rg", "primary-type": "Album" },
        },
      ],
    });
    const best = rankRecordings(looseTrack, [noTracklist])[0];
    // A made-up track number is worse than none.
    expect(
      buildRecordingProposal(looseTrack, best).override.track_number,
    ).toBeNull();
  });

  it("does not offer cover art when no release could be attributed", () => {
    // Covers are fetched per release; promising one the apply step cannot fetch
    // means approving a change that silently never happens.
    const noRelease = recording({ releases: [] });
    const best = rankRecordings(looseTrack, [noRelease])[0];
    expect(best.release).toBeNull();
    const { diffs } = buildRecordingProposal(looseTrack, best);
    expect(diffs.find((d) => d.field === "coverArt")).toBeUndefined();
  });

  it("offers cover art when a release was attributed", () => {
    const best = rankRecordings(looseTrack, [recording()])[0];
    const { diffs } = buildRecordingProposal(looseTrack, best);
    expect(diffs.find((d) => d.field === "coverArt")).toBeDefined();
  });

  it("honours deselected fields", () => {
    const best = rankRecordings(looseTrack, [recording()])[0];
    const { override } = buildRecordingProposal(looseTrack, best, ["title"]);
    expect(override.title).toBe("Creep");
    expect(override.album).toBeNull();
    expect(override.artist).toBeNull();
  });
});

// The review screen may only list changes the apply step will actually make.
// A diff it can't honour is worse than a missing one: the user approves it, and
// nothing happens.
describe("diffs the apply step can actually make", () => {
  const untaggedDiscs: LocalAlbumCandidate = {
    ...LOCAL,
    tracks: LOCAL.tracks.map((t) => ({ ...t, discNumber: null })),
  };

  const fieldsOf = (album: LocalAlbumCandidate, release = RELEASE) =>
    buildTrackProposals(album, scoreRelease(album, release))[0].diffs.map(
      (d) => d.field,
    );

  describe("disc numbers", () => {
    it("proposes nothing for an untagged single-disc album", () => {
      // Most rips carry no DISCNUMBER, and "disc 1 of 1" is not information.
      // Proposing it marked every track of every single-disc album as changed.
      expect(fieldsOf(untaggedDiscs)).not.toContain("discNumber");
    });

    it("writes no disc override for one either", () => {
      const { override } = buildTrackProposals(
        untaggedDiscs,
        scoreRelease(untaggedDiscs, RELEASE),
      )[0];
      expect(override.disc_number).toBeNull();
    });

    it("still corrects a disc number that disagrees", () => {
      const wrongDisc: LocalAlbumCandidate = {
        ...LOCAL,
        tracks: LOCAL.tracks.map((t) => ({ ...t, discNumber: 3 })),
      };
      const { diffs, override } = buildTrackProposals(
        wrongDisc,
        scoreRelease(wrongDisc, RELEASE),
      )[0];
      expect(diffs.find((d) => d.field === "discNumber")?.proposed).toBe(1);
      expect(override.disc_number).toBe(1);
    });

    it("proposes disc numbers on a genuine multi-disc release", () => {
      // Here the number carries real information, so an untagged file benefits.
      const twoDiscs: MbRelease = {
        ...RELEASE,
        media: [
          { position: 1, tracks: [RELEASE.media?.[0]?.tracks?.[0] as MbTrack] },
          { position: 2, tracks: [RELEASE.media?.[0]?.tracks?.[1] as MbTrack] },
        ],
      };
      const proposals = buildTrackProposals(
        untaggedDiscs,
        scoreRelease(untaggedDiscs, twoDiscs),
      );
      expect(proposals[1].override.disc_number).toBe(2);
      expect(proposals[1].diffs.map((d) => d.field)).toContain("discNumber");
    });
  });

  describe("fields MusicBrainz has no value for", () => {
    const undated: MbRelease = {
      ...RELEASE,
      date: undefined,
      "release-group": { id: "rg-1", title: "Dummy" },
    };

    it("offers no year change when the release has no date", () => {
      // The override would write null, which the view reads as "no correction"
      // and falls back to the scanned year — so "1994 → —" is a promise the
      // apply step provably cannot keep.
      expect(fieldsOf(LOCAL, undated)).not.toContain("year");
    });

    it("leaves the scanned year in place", () => {
      const { override } = buildTrackProposals(
        LOCAL,
        scoreRelease(LOCAL, undated),
      )[0];
      expect(override.year).toBeNull();
    });

    it("lets an otherwise-correct album count as a no-op", () => {
      // With phantom diffs the album entered the review queue offering changes
      // that would do nothing.
      const correct: LocalAlbumCandidate = {
        albumKey: "dummy portishead",
        album: "Dummy",
        albumArtist: "Portishead",
        year: 1994,
        tracks: [
          {
            trackId: "local-track:1",
            title: "Mysterons",
            artist: "Portishead",
            trackNumber: 1,
            discNumber: null,
            durationMs: 302000,
            artworkPath: "/art/a.jpg",
          },
          {
            trackId: "local-track:2",
            title: "Sour Times",
            artist: "Portishead",
            trackNumber: 2,
            discNumber: null,
            durationMs: 254000,
            artworkPath: "/art/a.jpg",
          },
        ],
      };
      expect(
        isNoOp(buildTrackProposals(correct, scoreRelease(correct, undated))),
      ).toBe(true);
    });
  });
});
