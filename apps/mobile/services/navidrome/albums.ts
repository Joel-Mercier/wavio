import navidromeApiInstance from "@/services/navidrome";
import { asList } from "@/services/navidrome/listBody";
import type { NavidromeAlbum } from "@/services/navidrome/types";
import type { AlbumListType } from "@/services/openSubsonic/lists";
import type { AlbumID3, AlbumList2 } from "@/services/openSubsonic/types";
import { useAuthBase } from "@/stores/auth";
import type { SortDirection } from "@/utils/sort";

// Adapts a Navidrome native-API album to the Subsonic `AlbumID3` shape so the
// rest of the app stays protocol-agnostic. Navidrome shares its album ids
// between the native and Subsonic surfaces, so cover art (/rest/getCoverArt)
// and drilling into the album keep working with the same id.
function mapNavidromeAlbumToAlbumID3(album: NavidromeAlbum): AlbumID3 {
  return {
    id: album.id,
    name: album.name,
    artist: album.albumArtist ?? album.artist,
    artistId: album.albumArtistId ?? album.artistId,
    coverArt: album.id,
    songCount: album.songCount ?? 0,
    duration: Math.round(album.duration ?? 0),
    year: album.maxYear || album.minYear,
    genres: album.genre ? [{ value: album.genre }] : undefined,
    created: album.createdAt ? new Date(album.createdAt) : new Date(0),
    played: album.playDate ? new Date(album.playDate) : undefined,
    playCount: album.playCount,
    starred: album.starred
      ? new Date(album.starredAt ?? Date.now())
      : undefined,
    userRating: album.rating || undefined,
    isCompilation: album.compilation,
    musicBrainzId: album.mbzAlbumId,
    sortName: album.sortAlbumName,
    displayArtist: album.albumArtist ?? album.artist,
  };
}

// `_sort` values are camelCase names the REST layer snake_cases before looking
// them up in the album repository's sortMappings (`name`, `artist`,
// `recently_added`, `max_year`, `starred_at`, `rated_at`), falling through to
// the raw album / annotation column otherwise (`play_count`, `play_date`,
// `rating`). Note "recently added" is `recentlyAdded` here, *not* the
// `createdAt` the media-file repository needs — the two repositories differ,
// see the matching note in services/navidrome/songs.ts.
const ALBUM_TYPE_SORT_PARAM: Partial<Record<AlbumListType, string>> = {
  alphabeticalByName: "name",
  alphabeticalByArtist: "artist",
  newest: "recentlyAdded",
  byYear: "maxYear",
  frequent: "playCount",
  recent: "playDate",
  highest: "rating",
  random: "random",
};

// The whole-library album browse, sorted in either direction. Subsonic's
// getAlbumList2 has no sort-order parameter — each `type` serves exactly one
// direction — so a browse that asks for an explicit order goes through the
// native REST API instead. Unordered browsing stays on getAlbumList2, the one
// exception being an unbounded `byYear`, which comes here in both directions
// because the Subsonic surface can only express a year sort as a year filter:
// see services/backend/lists.ts for the routing, and utils/albumSort.ts, which
// only offers the toggle when the native session exists.
//
// Guarded on serverType because this is reached through the `subsonic` dispatch
// slot, which also covers generic OpenSubsonic servers: return empty there
// rather than hitting a 404.
export const getAlbumList2 = async (
  type: AlbumListType,
  {
    size = 20,
    offset = 0,
    genre,
    order,
    musicFolderId,
  }: {
    size?: number;
    offset?: number;
    genre?: string;
    // Accepted for signature parity with the Subsonic implementation, and
    // deliberately unused: `_sort=maxYear` is a sort, not a filter. A `byYear`
    // call carrying real bounds is a genuine year filter (the home decade
    // carousels) and services/backend/lists.ts keeps it on getAlbumList2, the
    // only implementation that honours them.
    fromYear?: number;
    toYear?: number;
    order?: SortDirection;
    musicFolderId?: string;
  } = {},
): Promise<{ albumList2: AlbumList2 }> => {
  if (useAuthBase.getState().serverType !== "navidrome") {
    return { albumList2: { album: [] } };
  }
  const rsp = await navidromeApiInstance.get<NavidromeAlbum[]>("/album", {
    params: {
      _sort: ALBUM_TYPE_SORT_PARAM[type],
      _order: order === "desc" ? "DESC" : "ASC",
      _start: offset,
      // `_end` is exclusive, so this asks for exactly `size` rows.
      _end: offset + size,
      genre,
      library_id: musicFolderId,
    },
  });
  return {
    albumList2: {
      album: asList<NavidromeAlbum>(rsp.data).map(mapNavidromeAlbumToAlbumID3),
    },
  };
};
