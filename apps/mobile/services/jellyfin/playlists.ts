import type { AxiosRequestConfig } from "axios";
import jellyfinApiInstance from "@/services/jellyfin/index";
import {
  mapBaseItemToPlaylist,
  mapBaseItemToPlaylistWithSongs,
} from "@/services/jellyfin/mappers";
import type {
  BaseItemDto,
  JellyfinItemsResult,
  JellyfinPlaylistDto,
} from "@/services/jellyfin/types";
import { fakeEnvelope } from "@/services/jellyfin/unsupported";
import type {
  Playlist,
  Playlists,
  PlaylistWithSongs,
} from "@/services/openSubsonic/types";
import { useAuthBase } from "@/stores/auth";
import { chunk } from "@/utils/chunk";

const FIELDS = "DateCreated,UserData,ChildCount";
const DETAIL_FIELDS = `${FIELDS},Overview`;

// Item ids travel on the query string — Jellyfin takes them comma-joined in
// `Ids` / `EntryIds` rather than in a body — so a few hundred 32-char ids run
// past the 8 KB request line most reverse proxies allow and the call comes back
// 414. Matches SONG_ID_CHUNK_SIZE in the Subsonic implementation: the encodings
// differ but both land at roughly 33 bytes an id.
const ITEM_ID_CHUNK_SIZE = 100;

function userId(): string {
  return useAuthBase.getState().jellyfinUserId ?? "";
}

export const getPlaylists = async (_opts: { username?: string }) => {
  const rsp = await jellyfinApiInstance.get<JellyfinItemsResult>("/Items", {
    params: {
      UserId: userId(),
      Recursive: true,
      IncludeItemTypes: "Playlist",
      SortBy: "SortName",
      Fields: FIELDS,
    },
  });
  const playlists: Playlists = {
    playlist: (rsp.data?.Items ?? []).map((item) =>
      mapBaseItemToPlaylist(item),
    ),
  };
  return fakeEnvelope({ playlists });
};

export const getPlaylist = async (id: string) => {
  const [meta, items, playlistMeta] = await Promise.all([
    // A stale playlist id (deleted server-side, or restored from the persisted
    // query cache) 404s here. The call still fails — the caller needs the
    // metadata — but it's a data state, not an app bug.
    jellyfinApiInstance.get<BaseItemDto>(`/Users/${userId()}/Items/${id}`, {
      params: { Fields: DETAIL_FIELDS },
      notFoundIsExpected: true,
    } as AxiosRequestConfig & { notFoundIsExpected?: boolean }),
    jellyfinApiInstance.get<JellyfinItemsResult>(`/Playlists/${id}/Items`, {
      params: {
        UserId: userId(),
        Fields:
          "DateCreated,Genres,GenreItems,UserData,ProductionYear,MediaSources,ProviderIds",
      },
    }),
    // OpenAccess / Shares only come from the dedicated playlist endpoint, which
    // older servers don't expose at all. The `.catch` resolves that to "no
    // sharing info", so the interceptor must not report the 404 either.
    jellyfinApiInstance
      .get<JellyfinPlaylistDto>(`/Playlists/${id}`, {
        notFoundIsExpected: true,
      } as AxiosRequestConfig & { notFoundIsExpected?: boolean })
      .catch(() => null),
  ]);
  const playlist: PlaylistWithSongs = mapBaseItemToPlaylistWithSongs(
    meta.data,
    items.data?.Items ?? [],
    { openAccess: playlistMeta?.data?.OpenAccess },
  );
  return fakeEnvelope({ playlist });
};

export const createPlaylist = async (name: string, songId?: string[]) => {
  const rsp = await jellyfinApiInstance.post<BaseItemDto>("/Playlists", null, {
    params: {
      Name: name,
      UserId: userId(),
      MediaType: "Audio",
      Ids: songId?.join(","),
    },
  });
  // Jellyfin returns just { Id } here, not a full BaseItemDto. Fetch the new
  // playlist so downstream consumers see the same shape as Subsonic.
  const playlistRsp = await jellyfinApiInstance.get<BaseItemDto>(
    `/Users/${userId()}/Items/${rsp.data.Id}`,
    { params: { Fields: FIELDS } },
  );
  const playlist: Playlist = mapBaseItemToPlaylist(playlistRsp.data);
  return fakeEnvelope({ playlist });
};

export const deletePlaylist = async (id: string) => {
  await jellyfinApiInstance.delete(`/Items/${id}`);
  return fakeEnvelope({});
};

// Overview is only writable through the admin-only item update, which replaces
// every editable field with the body it is sent. So the body is the item as the
// server just returned it (the single-item GET carries every field), changed in
// Overview alone, and nothing is written when the description is unchanged:
// the edit form always submits it, and a non-admin would be refused.
async function updatePlaylistOverview(id: string, comment: string) {
  const { data: item } = await jellyfinApiInstance.get<BaseItemDto>(
    `/Users/${userId()}/Items/${id}`,
  );
  if ((item.Overview ?? "") === comment) return;
  await jellyfinApiInstance.post(`/Items/${id}`, {
    ...item,
    Overview: comment,
  });
}

export const updatePlaylist = async (
  id: string,
  {
    name,
    comment,
    isPublic,
    songIdToAdd,
    songIndexToRemove,
  }: {
    name?: string;
    comment?: string;
    isPublic?: boolean;
    songIdToAdd?: string[];
    songIndexToRemove?: string[];
  },
) => {
  // The dedicated UpdatePlaylist endpoint applies Name/IsPublic in a single
  // request without clobbering Users, but ignores Overview.
  if (name !== undefined || isPublic !== undefined) {
    await jellyfinApiInstance.post(`/Playlists/${id}`, {
      ...(name !== undefined ? { Name: name } : {}),
      ...(isPublic !== undefined ? { IsPublic: isPublic } : {}),
    });
  }
  if (comment !== undefined) await updatePlaylistOverview(id, comment);
  // Sequential, not parallel: each request appends its ids to the end of the
  // playlist, so the caller's track order only survives if the chunks land in
  // order. A failure part-way leaves the earlier chunks added — a partial add
  // the user can retry, where the unsplit request added nothing at all.
  for (const ids of chunk(songIdToAdd ?? [], ITEM_ID_CHUNK_SIZE)) {
    await jellyfinApiInstance.post(`/Playlists/${id}/Items`, null, {
      params: {
        Ids: ids.join(","),
        UserId: userId(),
      },
    });
  }
  if (songIndexToRemove?.length) {
    // Subsonic deletes by index; Jellyfin needs the PlaylistItemId. Fetch
    // ordered items and translate.
    const items = await jellyfinApiInstance.get<JellyfinItemsResult>(
      `/Playlists/${id}/Items`,
      { params: { UserId: userId() } },
    );
    const ids = (items.data?.Items ?? [])
      .map((i, idx) =>
        songIndexToRemove.includes(String(idx))
          ? ((i as BaseItemDto & { PlaylistItemId?: string }).PlaylistItemId ??
            i.Id)
          : null,
      )
      .filter((x): x is string => !!x);
    // Safe to split, unlike the Subsonic implementation's `songIndexToRemove`:
    // the index → PlaylistItemId translation above already ran against one
    // snapshot of the playlist, and an entry id keeps identifying the same entry
    // however many of its neighbours are deleted first. There are no indices
    // left to shift.
    for (const entryIds of chunk(ids, ITEM_ID_CHUNK_SIZE)) {
      await jellyfinApiInstance.delete(`/Playlists/${id}/Items`, {
        params: { EntryIds: entryIds.join(",") },
      });
    }
  }
  return fakeEnvelope({});
};
