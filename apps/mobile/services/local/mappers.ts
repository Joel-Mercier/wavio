import type { TrackRow } from "@/services/local/db";
import { localAlbumId, localArtistId } from "@/services/local/keys";
import type {
  AlbumAggRow,
  ArtistAggRow,
  GenreRow,
} from "@/services/local/repository";
import type {
  AlbumID3,
  ArtistID3,
  Child,
  Genre,
  IndexID3,
} from "@/services/openSubsonic/types";

// Adapts SQLite rows to the OpenSubsonic envelope shapes, mirroring
// services/jellyfin/mappers.ts. The rest of the app stays protocol-agnostic.
//
// Cover-art note: local `coverArt` holds a `file://` URI to the extracted
// artwork (content-hashed on disk), not a server cover-art id. UI rendering
// local items should use the value directly rather than via `getCoverArtUrl`.

export function mapRowToChild(row: TrackRow): Child {
  return {
    id: row.id,
    parent: row.album_key ? localAlbumId(row.album_key) : undefined,
    isDir: false,
    title: row.title ?? "Unknown",
    name: row.title ?? undefined,
    album: row.album ?? undefined,
    albumId: row.album_key ? localAlbumId(row.album_key) : undefined,
    artist: row.artist ?? undefined,
    artistId: row.artist_key ? localArtistId(row.artist_key) : undefined,
    track: row.track_number ?? undefined,
    year: row.year ?? undefined,
    genre: row.genre ?? undefined,
    coverArt: row.artwork_path ?? undefined,
    size: row.size ?? undefined,
    contentType: row.artwork_mime ?? undefined,
    suffix: row.suffix ?? undefined,
    duration:
      row.duration_ms != null ? Math.round(row.duration_ms / 1000) : undefined,
    bitRate: row.bitrate != null ? Math.round(row.bitrate / 1000) : undefined,
    path: row.path ?? undefined,
    discNumber: row.disc_number ?? undefined,
    created: new Date(row.indexed_at),
    type: "music",
    musicBrainzId: row.music_brainz_id ?? undefined,
    displayAlbumArtist: row.album_artist ?? undefined,
    displayComposer: row.composer ?? undefined,
    artists: parseArtists(row.artists_json, row.artist_key),
    replayGain: parseReplayGain(row.replay_gain_json),
  };
}

export function mapAggToAlbum(row: AlbumAggRow): AlbumID3 {
  return {
    id: localAlbumId(row.album_key),
    name: row.name ?? "Unknown album",
    artist: row.album_artist ?? row.artist ?? undefined,
    artistId: row.artist_key ? localArtistId(row.artist_key) : undefined,
    coverArt: row.cover ?? undefined,
    songCount: row.song_count,
    duration: row.duration_ms != null ? Math.round(row.duration_ms / 1000) : 0,
    created: new Date(row.indexed_at),
    year: row.year ?? undefined,
    isCompilation: row.is_compilation === 1,
    musicBrainzId: row.music_brainz_id ?? undefined,
    displayArtist: row.album_artist ?? undefined,
  };
}

export function mapAggToArtist(row: ArtistAggRow): ArtistID3 {
  return {
    id: localArtistId(row.artist_key),
    name: row.name ?? "Unknown artist",
    albumCount: row.album_count,
    coverArt: row.cover ?? undefined,
  };
}

export function mapGenreRow(row: GenreRow): Genre {
  return {
    value: row.value,
    albumCount: row.album_count,
    songCount: row.song_count,
  };
}

/** Group artists into alphabetical index buckets for the ArtistsID3 shape. */
export function buildArtistIndex(artists: ArtistID3[]): IndexID3[] {
  const buckets = new Map<string, ArtistID3[]>();
  for (const artist of artists) {
    const first = (artist.name?.[0] ?? "#").toUpperCase();
    const letter = /[A-Z]/.test(first) ? first : "#";
    const bucket = buckets.get(letter);
    if (bucket) bucket.push(artist);
    else buckets.set(letter, [artist]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, artist]) => ({ name, artist }));
}

function parseArtists(
  json: string | null,
  artistKey: string | null,
): { id: string; name: string }[] | undefined {
  if (!json) return undefined;
  try {
    const names = JSON.parse(json) as string[];
    if (!Array.isArray(names) || names.length === 0) return undefined;
    return names.map((name) => ({ id: localArtistId(artistKey ?? ""), name }));
  } catch {
    return undefined;
  }
}

function parseReplayGain(json: string | null): Child["replayGain"] {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as Child["replayGain"];
  } catch {
    return undefined;
  }
}
