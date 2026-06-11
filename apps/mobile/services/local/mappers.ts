import type {
  PodcastChannelRow,
  PodcastEpisodeRow,
  RadioStationRow,
  TrackRow,
} from "@/services/local/db";
import { localAlbumId, localArtistId } from "@/services/local/keys";
import type {
  AlbumAggRow,
  ArtistAggRow,
  GenreRow,
  PlaylistAggRow,
} from "@/services/local/repository";
import type {
  AlbumID3,
  ArtistID3,
  Child,
  Genre,
  IndexID3,
  InternetRadioStation,
  Playlist,
  PodcastChannel,
  PodcastEpisode,
  PodcastStatus,
} from "@/services/openSubsonic/types";
import useLocalLibrary, { type FavoriteMap } from "@/stores/localLibrary";

// Adapts SQLite rows to the OpenSubsonic envelope shapes, mirroring
// services/jellyfin/mappers.ts. The rest of the app stays protocol-agnostic.
//
// Cover-art note: local `coverArt` holds a `file://` URI to the extracted
// artwork (content-hashed on disk), not a server cover-art id. UI rendering
// local items should use the value directly rather than via `getCoverArtUrl`.

// Reads the matching `starred` date out of the local favourites store so every
// mapped item reflects its star state wherever it appears (lists, album/artist
// headers, search, the favourites screen). Returns undefined when not starred.
function starredAt(map: FavoriteMap, id: string): Date | undefined {
  const ts = map[id];
  return ts ? new Date(ts) : undefined;
}

// Reads the user rating (1–5) for an id from the local store, undefined if none.
function ratingOf(id: string): number | undefined {
  return useLocalLibrary.getState().ratings[id] || undefined;
}

export function mapRowToChild(row: TrackRow): Child {
  return {
    id: row.id,
    starred: starredAt(useLocalLibrary.getState().favoriteTracks, row.id),
    userRating: ratingOf(row.id),
    playCount: row.play_count || undefined,
    played: row.last_played_at ? new Date(row.last_played_at) : undefined,
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
  const id = localAlbumId(row.album_key);
  return {
    id,
    starred: starredAt(useLocalLibrary.getState().favoriteAlbums, id),
    userRating: ratingOf(id),
    playCount: row.play_count || undefined,
    played: row.last_played_at ? new Date(row.last_played_at) : undefined,
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
    releaseTypes: parseReleaseTypes(row.release_types_json),
  };
}

export function mapAggToArtist(row: ArtistAggRow): ArtistID3 {
  const id = localArtistId(row.artist_key);
  return {
    id,
    starred: starredAt(useLocalLibrary.getState().favoriteArtists, id),
    userRating: ratingOf(id),
    name: row.name ?? "Unknown artist",
    albumCount: row.album_count,
    coverArt: row.cover ?? undefined,
  };
}

export function mapPlaylist(row: PlaylistAggRow): Playlist {
  return {
    id: row.id,
    name: row.name,
    comment: row.comment ?? undefined,
    coverArt: row.cover ?? undefined,
    songCount: row.song_count,
    duration: row.duration_ms != null ? Math.round(row.duration_ms / 1000) : 0,
    created: new Date(row.created_at),
    changed: new Date(row.changed_at),
    // No accounts on-device: playlists are owned by the single local user and
    // are never shared/public.
    public: false,
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

export function mapRadioRow(row: RadioStationRow): InternetRadioStation {
  return {
    id: row.id,
    name: row.name,
    streamUrl: row.stream_url,
    homePageUrl: row.home_page_url ?? undefined,
  };
}

export function mapChannelRow(
  row: PodcastChannelRow,
  episodes?: PodcastEpisode[],
): PodcastChannel {
  return {
    id: row.id,
    url: row.url,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    author: row.author ?? undefined,
    // A self-hosted channel's artwork is a direct feed image URL, not a Subsonic
    // cover-art id; UI prefers `originalImageUrl`, and `artworkUrl` passes
    // absolute URLs through for the local backend.
    originalImageUrl: row.original_image_url ?? undefined,
    status: row.status as PodcastStatus,
    errorMessage: row.error_message ?? undefined,
    episode: episodes,
  };
}

// Local episodes stream straight from their enclosure URL, so they're always
// "completed" and immediately playable. `streamId` is set to the episode id,
// which `utils/streaming.ts` decodes back to the enclosure URL — so
// `podcastEpisodeToTrack` / `isPlayablePodcastEpisode` work unchanged.
export function mapEpisodeRow(row: PodcastEpisodeRow): PodcastEpisode {
  return {
    id: row.id,
    channelId: row.channel_id,
    streamId: row.id,
    status: "completed",
    isDir: false,
    title: row.title ?? "Unknown episode",
    description: row.description ?? undefined,
    publishDate: row.publish_date ? new Date(row.publish_date) : undefined,
    duration: row.duration ?? undefined,
    suffix: row.suffix ?? undefined,
    contentType: row.content_type ?? undefined,
    size: row.size ?? undefined,
    coverArt: row.original_image_url ?? undefined,
    type: "podcast",
    created: new Date(row.created_at),
  };
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

function parseReleaseTypes(json: string | null): string[] | undefined {
  if (!json) return undefined;
  try {
    const types = JSON.parse(json) as string[];
    return Array.isArray(types) && types.length > 0 ? types : undefined;
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
