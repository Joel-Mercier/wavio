import navidromeApiInstance from "@/services/navidrome";
import type { NavidromeSong } from "@/services/navidrome/types";
import type { Child, Songs } from "@/services/openSubsonic/types";
import { useAuthBase } from "@/stores/auth";
import type { SongSortField, SongSortType } from "@/utils/songSort";
import { parseSortType } from "@/utils/sort";

// Adapts a Navidrome native-API song to the Subsonic `Child` shape so the rest
// of the app stays protocol-agnostic. Navidrome's media-file ids are shared with
// its Subsonic surface, so streaming (/rest/stream) and cover art
// (/rest/getCoverArt) keep working with the same id.
function mapNavidromeSongToChild(song: NavidromeSong): Child {
  return {
    id: song.id,
    isDir: false,
    type: "music",
    title: song.title,
    album: song.album,
    albumId: song.albumId,
    artist: song.artist,
    artistId: song.artistId,
    track: song.trackNumber,
    discNumber: song.discNumber,
    year: song.year,
    genre: song.genre,
    duration: song.duration,
    size: song.size,
    suffix: song.suffix,
    bitRate: song.bitRate,
    playCount: song.playCount,
    starred: song.starred ? new Date(song.starredAt ?? Date.now()) : undefined,
    coverArt: song.albumId ?? song.id,
    path: song.path,
    displayAlbumArtist: song.albumArtist,
    musicBrainzId: song.mbzTrackId,
  };
}

// The user's globally most-played tracks, via Navidrome's native REST API
// (`GET /api/song`) — the Subsonic surface has no equivalent global sort. Guarded
// on serverType: reached through the `subsonic` dispatch slot, which also covers
// generic OpenSubsonic servers (gated off by the `mostPlayedTracks` capability),
// so return empty there rather than hitting a 404.
export const getMostPlayedSongs = async ({
  size = 20,
  offset = 0,
  musicFolderId,
}: {
  size?: number;
  offset?: number;
  musicFolderId?: string;
} = {}): Promise<{ songs: Songs }> => {
  if (useAuthBase.getState().serverType !== "navidrome") {
    return { songs: { song: [] } };
  }
  const rsp = await navidromeApiInstance.get<NavidromeSong[]>("/song", {
    params: {
      _sort: "playCount",
      _order: "DESC",
      _start: offset,
      _end: offset + size,
      library_id: musicFolderId,
    },
  });
  // Only surface tracks actually played (mirrors Jellyfin IsPlayed / local
  // HAVING play_count > 0). Sorted DESC, so once a page runs into unplayed
  // tracks the trimmed length also signals the end of pagination.
  const song = (rsp.data ?? [])
    .filter((s) => (s.playCount ?? 0) > 0)
    .map(mapNavidromeSongToChild);
  return { songs: { song } };
};

// `_sort` values are camelCase names of the underlying media_file / annotation
// columns (Navidrome snake_cases them and, for title/artist/album, swaps in its
// order_* sort columns). Verified against the schema of a 0.63 and a develop
// instance. Note "recently added" is `createdAt` here — `recently_added` is a
// mapping the *album* repository has and the media-file one doesn't.
const SONG_SORT_PARAM: Partial<Record<SongSortField, string>> = {
  addedAt: "createdAt",
  alphabetical: "title",
  artist: "artist",
  albumArtist: "albumArtist",
  album: "album",
  year: "year",
  duration: "duration",
  playCount: "playCount",
};

// The whole-library track browse, sorted. The Subsonic surface can't do this
// (its browse is an empty-query search3, which takes no sort parameter), so a
// sorted browse goes through the native REST API instead — the same call as
// getMostPlayedSongs above, with the field the user picked. Unsorted browsing
// stays on search3: see services/backend/lists.ts, which only routes here when a
// sort is actually asked for, and utils/songSort.ts, which only offers the
// control when the native session exists.
export const getSongs = async ({
  size = 50,
  offset = 0,
  sort,
  musicFolderId,
}: {
  query?: string;
  size?: number;
  offset?: number;
  sort?: SongSortType;
  musicFolderId?: string;
} = {}): Promise<{ songs: Songs }> => {
  const { field, direction } = parseSortType(sort ?? "defaultAsc");
  const rsp = await navidromeApiInstance.get<NavidromeSong[]>("/song", {
    params: {
      _sort: SONG_SORT_PARAM[field],
      _order: direction === "desc" ? "DESC" : "ASC",
      _start: offset,
      // `_end` is exclusive, so this asks for exactly `size` rows.
      _end: offset + size,
      library_id: musicFolderId,
    },
  });
  return { songs: { song: (rsp.data ?? []).map(mapNavidromeSongToChild) } };
};
