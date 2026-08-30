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

const FIELDS = "DateCreated,UserData,ChildCount";

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
      params: { Fields: FIELDS },
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

export const updatePlaylist = async (
  id: string,
  {
    name,
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
  // Jellyfin has no playlist description field; `comment` is intentionally
  // dropped. Use the dedicated UpdatePlaylist endpoint for Name/IsPublic so
  // both apply in a single request without clobbering Users.
  if (name !== undefined || isPublic !== undefined) {
    await jellyfinApiInstance.post(`/Playlists/${id}`, {
      ...(name !== undefined ? { Name: name } : {}),
      ...(isPublic !== undefined ? { IsPublic: isPublic } : {}),
    });
  }
  if (songIdToAdd?.length) {
    await jellyfinApiInstance.post(`/Playlists/${id}/Items`, null, {
      params: {
        Ids: songIdToAdd.join(","),
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
    if (ids.length) {
      await jellyfinApiInstance.delete(`/Playlists/${id}/Items`, {
        params: { EntryIds: ids.join(",") },
      });
    }
  }
  return fakeEnvelope({});
};
