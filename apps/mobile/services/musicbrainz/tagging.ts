import { albumKey, normalizeKey } from "@/services/local/keys";
import type { TrackOverrideInput } from "@/services/local/tagOverrides";
import type {
  RecordingMatch,
  ReleaseMatch,
} from "@/services/musicbrainz/match";
import { releaseArtistName } from "@/services/musicbrainz/match";
import type {
  LocalAlbumCandidate,
  LocalTrackCandidate,
  MbRelease,
  MbTrack,
} from "@/services/musicbrainz/types";

// Genre is deliberately absent: MusicBrainz exposes genres only as crowd-sourced
// tags behind a separate `inc=genres`, and they're noisier than the tags most
// libraries already carry.
export type TagField =
  | "title"
  | "artist"
  | "album"
  | "albumArtist"
  | "year"
  | "trackNumber"
  | "discNumber"
  | "coverArt";

export const ALL_TAG_FIELDS: TagField[] = [
  "title",
  "artist",
  "album",
  "albumArtist",
  "year",
  "trackNumber",
  "discNumber",
  "coverArt",
];

// Cover art is fetched from the Cover Art Archive rather than read out of the
// release document, so the pure proposal builder can't resolve its value — the
// apply step downloads it and fills `artwork_path` in (see scanner.applyMatch).
//
// Deliberately conservative: a cover is only proposed for a track that has none.
// Artwork already embedded in a file is something the user chose (or ripped),
// and silently swapping it for the archive's copy is a change they didn't ask
// for — unlike a wrong title, a present cover is rarely *wrong*.
export function wantsCoverArt(
  track: LocalTrackCandidate,
  fields: TagField[],
): boolean {
  return fields.includes("coverArt") && !track.artworkPath;
}

/** First four digits of an ISO-ish MusicBrainz date ("1994", "1994-08-22"). */
export function parseYear(date: string | undefined): number | null {
  if (!date) return null;
  const match = /^(\d{4})/.exec(date);
  return match ? Number(match[1]) : null;
}

function trackArtistName(track: MbTrack, release: MbRelease): string | null {
  const credits = track["artist-credit"] ?? track.recording?.["artist-credit"];
  if (!credits?.length) return releaseArtistName(release);
  return credits
    .map((c) => `${c.name ?? c.artist.name}${c.joinphrase ?? ""}`)
    .join("")
    .trim();
}

function trackArtistNames(track: MbTrack): string[] {
  const credits = track["artist-credit"] ?? track.recording?.["artist-credit"];
  if (!credits?.length) return [];
  return credits.map((c) => c.artist.name);
}

export type FieldDiff = {
  field: TagField;
  current: string | number | null;
  proposed: string | number | null;
};

export type TrackProposal = {
  local: LocalTrackCandidate;
  // Null for a loose track matched to a recording rather than to a position in
  // a release tracklist.
  mbTrack: MbTrack | null;
  diffs: FieldDiff[];
  override: TrackOverrideInput;
};

/**
 * The album a per-recording match's track already belongs to, when it has one.
 *
 * Per-recording matching is also the fallback for a *real* album MusicBrainz
 * simply didn't return, and there each track resolves to its own release.
 * Letting those attributions rewrite the album fields would hand every track a
 * different album key and break the album apart, so when this is present the
 * album-level fields are left exactly as scanned and only the per-track fields
 * are corrected.
 */
export type AlbumGrouping = {
  album: string | null;
  albumArtist: string | null;
  albumKey: string;
};

/**
 * The changes a correction will actually make, out of everything it considered.
 *
 * A field counts only when the apply step can genuinely change it. A null
 * proposal means MusicBrainz had no value, and the override layer reads a null
 * column as "no correction" and falls back to the scanned tag — so listing one
 * promises the reviewer a change that provably cannot happen ("1994 → —" on a
 * release with no date, then nothing changes on apply). Keeping this in one
 * place is what stops the review screen and the override from disagreeing.
 */
function changedFields(
  candidates: FieldDiff[],
  wants: (field: TagField) => boolean,
): FieldDiff[] {
  return candidates.filter(
    (d) => wants(d.field) && d.proposed != null && d.current !== d.proposed,
  );
}

/**
 * `null` when a recomputed grouping key matches the scanned one.
 *
 * Grouping keys are the one override field that is *derived* rather than read
 * off MusicBrainz, so writing one that equals the scanned value would be a
 * correction that corrects nothing — and would then have to be kept in step by
 * hand every time the fields it derives from change.
 */
function keyOverride(scanned: string, next: string): string | null {
  return next === scanned ? null : next;
}

/**
 * Turns a ranked release match into the per-track corrections to persist.
 *
 * A field the user hasn't opted into is written as `null`, which the
 * `tracks_resolved` view reads as "no correction" and falls back to the scanned
 * tag — so deselecting a field genuinely leaves it alone rather than blanking it.
 *
 * The grouping keys are recomputed from the *effective* values (corrected where
 * a field is selected, scanned where it isn't), because album and artist ids are
 * derived from those keys — see services/local/keys.ts. Getting this wrong would
 * leave a corrected album still filed under its old name.
 */
export function buildTrackProposals(
  local: LocalAlbumCandidate,
  match: ReleaseMatch,
  fields: TagField[] = ALL_TAG_FIELDS,
): TrackProposal[] {
  const release = match.release;
  const wants = (field: TagField) => fields.includes(field);

  const mbAlbum = release.title;
  const mbAlbumArtist = releaseArtistName(release);
  const mbYear =
    parseYear(release.date) ??
    parseYear(release["release-group"]?.["first-release-date"]);

  const effectiveAlbum = wants("album") ? mbAlbum : local.album;
  const effectiveAlbumArtist = wants("albumArtist")
    ? mbAlbumArtist
    : local.albumArtist;

  // Computed once, from album-level values only. Deriving it per track would go
  // through albumKey()'s fallback to the *track* artist, which hands every track
  // of an album-artist-less compilation a different key and scatters the album
  // across the library the moment the match is applied. When nothing
  // album-level changed this stays null and the view falls back to the scanned
  // key, so the album simply stays where it is.
  const movedAlbumKey =
    effectiveAlbum !== local.album || effectiveAlbumArtist !== local.albumArtist
      ? keyOverride(
          local.albumKey,
          albumKey(effectiveAlbum, effectiveAlbumArtist || mbAlbumArtist, null),
        )
      : null;

  const isMultiDisc = (release.media?.length ?? 1) > 1;

  const byTrackId = new Map(local.tracks.map((t) => [t.trackId, t]));

  const proposals: TrackProposal[] = [];
  for (const aligned of match.tracks) {
    const mbTrack = aligned.mbTrack;
    const localTrack = byTrackId.get(aligned.trackId);
    if (!mbTrack || !localTrack) continue;

    const mbTitle = mbTrack.title || mbTrack.recording?.title || null;
    const mbArtist = trackArtistName(mbTrack, release);
    const mbTrackNumber = mbTrack.position;
    // "Disc 1 of 1" is not information. A single-disc rip with no disc tag is
    // already correct, so proposing one would mark every track of every
    // single-disc album as changed — burying the diffs that matter, pushing
    // otherwise-correct albums into the review queue, and in "files" mode
    // rewriting each file to add a tag that says nothing. A local value that
    // actually disagrees is still worth correcting, hence the second clause.
    const mbDiscNumber =
      isMultiDisc || localTrack.discNumber != null
        ? (mbTrack.discNumber ?? null)
        : null;

    const effectiveArtist = wants("artist") ? mbArtist : localTrack.artist;

    const artistNames = trackArtistNames(mbTrack);

    const override: TrackOverrideInput = {
      track_id: localTrack.trackId,
      title: wants("title") ? mbTitle : null,
      artist: wants("artist") ? mbArtist : null,
      album: wants("album") ? mbAlbum : null,
      album_artist: wants("albumArtist") ? mbAlbumArtist : null,
      genre: null,
      year: wants("year") ? mbYear : null,
      track_number: wants("trackNumber") ? mbTrackNumber : null,
      disc_number: wants("discNumber") ? mbDiscNumber : null,
      artists_json:
        wants("artist") && artistNames.length > 1
          ? JSON.stringify(artistNames)
          : null,
      music_brainz_id: mbTrack.recording?.id ?? null,
      // Filled in by the apply step, which downloads the cover.
      artwork_path: null,
      album_key: movedAlbumKey,
      artist_key: keyOverride(
        normalizeKey(local.albumArtist || localTrack.artist),
        normalizeKey(effectiveAlbumArtist || effectiveArtist),
      ),
      mb_recording_id: mbTrack.recording?.id ?? null,
      mb_release_id: release.id,
      mb_release_group_id: release["release-group"]?.id ?? null,
      mb_artist_id: release["artist-credit"]?.[0]?.artist.id ?? null,
    };

    const candidateDiffs: FieldDiff[] = [
      { field: "title", current: localTrack.title, proposed: mbTitle },
      { field: "artist", current: localTrack.artist, proposed: mbArtist },
      { field: "album", current: local.album, proposed: mbAlbum },
      {
        field: "albumArtist",
        current: local.albumArtist,
        proposed: mbAlbumArtist,
      },
      { field: "year", current: local.year, proposed: mbYear },
      {
        field: "trackNumber",
        current: localTrack.trackNumber,
        proposed: mbTrackNumber,
      },
      {
        field: "discNumber",
        current: localTrack.discNumber,
        proposed: mbDiscNumber,
      },
    ];
    const diffs = changedFields(candidateDiffs, wants);
    if (wantsCoverArt(localTrack, fields)) {
      diffs.push({ field: "coverArt", current: null, proposed: "musicbrainz" });
    }

    proposals.push({ local: localTrack, mbTrack, diffs, override });
  }

  return proposals;
}

/** True when the match would change nothing — used to skip already-correct albums. */
export function isNoOp(proposals: TrackProposal[]): boolean {
  return proposals.every((p) => p.diffs.length === 0);
}

/**
 * Builds a proposal for a single loose track matched to a MusicBrainz recording.
 *
 * The album-level builder can't be reused here: there is no release to align a
 * tracklist against, and each track carries its own independently-chosen album.
 * Track and disc numbers come from the attributed release's tracklist entry when
 * it has one, and are simply left uncorrected when it doesn't — a made-up track
 * number is worse than none.
 *
 * `grouping` is the album these tracks already form, when they form one. Because
 * each track here is attributed independently, the album fields are only ever
 * proposed for a track that has no album to begin with — see AlbumGrouping.
 */
export function buildRecordingProposal(
  local: LocalTrackCandidate,
  match: RecordingMatch,
  fields: TagField[] = ALL_TAG_FIELDS,
  grouping: AlbumGrouping | null = null,
): TrackProposal {
  const wants = (field: TagField) => fields.includes(field);
  const { recording, release } = match;

  const mbTitle = recording.title || null;
  const mbArtist =
    (recording["artist-credit"] ?? [])
      .map((c) => `${c.name ?? c.artist.name}${c.joinphrase ?? ""}`)
      .join("")
      .trim() || null;
  const mbAlbum = release?.title ?? null;
  const mbYear = parseYear(
    release?.date ?? release?.["release-group"]?.["first-release-date"],
  );

  const trackEntry = release?.media?.[0]?.track?.[0];
  const parsedTrackNumber = trackEntry?.number
    ? Number.parseInt(trackEntry.number, 10)
    : (trackEntry?.position ?? null);
  const mbTrackNumber =
    parsedTrackNumber != null && Number.isFinite(parsedTrackNumber)
      ? parsedTrackNumber
      : null;

  // A track that already belongs to an album keeps it: only a genuinely loose
  // track may be filed under the release it happened to be attributed to.
  const proposesAlbum = grouping === null && wants("album") && mbAlbum !== null;
  const proposesAlbumArtist =
    grouping === null && wants("albumArtist") && mbArtist !== null;
  const effectiveArtist = wants("artist") ? mbArtist : local.artist;
  const effectiveAlbumArtist = grouping
    ? grouping.albumArtist
    : proposesAlbumArtist
      ? mbArtist
      : null;

  const artistNames = (recording["artist-credit"] ?? []).map(
    (c) => c.artist.name,
  );

  const override: TrackOverrideInput = {
    track_id: local.trackId,
    title: wants("title") ? mbTitle : null,
    artist: wants("artist") ? mbArtist : null,
    album: proposesAlbum ? mbAlbum : null,
    album_artist: proposesAlbumArtist ? mbArtist : null,
    genre: null,
    year: wants("year") ? mbYear : null,
    track_number: wants("trackNumber") ? mbTrackNumber : null,
    disc_number: null,
    artists_json:
      wants("artist") && artistNames.length > 1
        ? JSON.stringify(artistNames)
        : null,
    music_brainz_id: recording.id,
    artwork_path: null,
    // Only ever set for a track that had no album, so this is always a genuine
    // move rather than a key that might match the scanned one.
    album_key: proposesAlbum
      ? albumKey(mbAlbum, effectiveAlbumArtist || mbArtist, null)
      : null,
    artist_key: keyOverride(
      normalizeKey(grouping?.albumArtist || local.artist),
      normalizeKey(effectiveAlbumArtist || effectiveArtist),
    ),
    mb_recording_id: recording.id,
    mb_release_id: release?.id ?? null,
    mb_release_group_id: release?.["release-group"]?.id ?? null,
    mb_artist_id: recording["artist-credit"]?.[0]?.artist.id ?? null,
  };

  // A proposed value of null is filtered out below, so the album fields drop off
  // the list exactly when they're no longer being proposed — the review screen
  // never offers a change the apply step won't make.
  const candidateDiffs: FieldDiff[] = [
    { field: "title", current: local.title, proposed: mbTitle },
    { field: "artist", current: local.artist, proposed: mbArtist },
    {
      field: "album",
      current: grouping?.album ?? null,
      proposed: proposesAlbum ? mbAlbum : null,
    },
    {
      field: "albumArtist",
      current: grouping?.albumArtist ?? null,
      proposed: proposesAlbumArtist ? mbArtist : null,
    },
    { field: "year", current: null, proposed: mbYear },
    {
      field: "trackNumber",
      current: local.trackNumber,
      proposed: mbTrackNumber,
    },
  ];
  const diffs = changedFields(candidateDiffs, wants);
  // Covers are fetched per *release*, so a recording with no attributable
  // release has none to offer. Without this check the review screen promises a
  // cover that the apply step then can't fetch — a change the user approved and
  // that silently never happens.
  if (release && wantsCoverArt(local, fields)) {
    diffs.push({ field: "coverArt", current: null, proposed: "musicbrainz" });
  }

  // `mbTrack` is release-shaped and has no meaning here; the recording id is
  // carried on the override instead.
  return { local, mbTrack: null, diffs, override };
}
