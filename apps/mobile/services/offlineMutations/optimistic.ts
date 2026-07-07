import type { QueryClient } from "@tanstack/react-query";
import type {
  AlbumID3,
  AlbumWithSongsID3,
  ArtistID3,
  ArtistWithAlbumsID3,
  Child,
  Playlist,
  PlaylistWithSongs,
  SearchResult3,
  Starred2,
} from "@/services/openSubsonic/types";
import type { OfflineAction } from "@/stores/offlineMutations";
import usePlaylistsStore from "@/stores/playlists";
import useQueue from "@/stores/queue";

type AlbumData = { album: AlbumWithSongsID3 };
type ArtistData = { artist: ArtistWithAlbumsID3 };
type PlaylistData = { playlist: PlaylistWithSongs };
type PlaylistsData = { playlists: { playlist?: Playlist[] } };
type Starred2Data = { starred2: Starred2 };
type Search3Data = { searchResult3: SearchResult3 };

// Server dates arrive as ISO strings at runtime despite the `Date` typings.
const now = () => new Date().toISOString() as unknown as Date;

export function findChildInCaches(
  queryClient: QueryClient,
  id: string,
): Child | undefined {
  const scan = (children?: Child[]) => children?.find((c) => c.id === id);
  for (const [, data] of queryClient.getQueriesData<AlbumData>({
    queryKey: ["album"],
  })) {
    const match = scan(data?.album?.song);
    if (match) return match;
  }
  for (const [, data] of queryClient.getQueriesData<PlaylistData>({
    queryKey: ["playlist"],
  })) {
    const match = scan(data?.playlist?.entry);
    if (match) return match;
  }
  for (const [, data] of queryClient.getQueriesData<Starred2Data>({
    queryKey: ["starred2"],
  })) {
    const match = scan(data?.starred2?.song);
    if (match) return match;
  }
  for (const [, data] of queryClient.getQueriesData<Search3Data>({
    queryKey: ["search3"],
  })) {
    const match = scan(data?.searchResult3?.song);
    if (match) return match;
  }
  const track = useQueue.getState().queue.find((t) => t.id === id);
  if (track) {
    return {
      id: track.id,
      title: track.title ?? "",
      isDir: false,
      album: track.album,
      albumId: track.albumId,
      artist: track.artist,
      artistId: track.artistId,
      coverArt: track.coverArt,
      duration: track.duration,
      starred: track.starred,
    };
  }
  return undefined;
}

const patchChildren = (
  children: Child[] | undefined,
  id: string,
  patch: Partial<Child>,
): Child[] | undefined =>
  children?.some((c) => c.id === id)
    ? children.map((c) => (c.id === id ? { ...c, ...patch } : c))
    : children;

const patchSongEverywhere = (
  queryClient: QueryClient,
  id: string,
  patch: Partial<Child>,
) => {
  queryClient.setQueriesData<AlbumData>({ queryKey: ["album"] }, (data) =>
    data?.album?.song
      ? {
          ...data,
          album: {
            ...data.album,
            song: patchChildren(data.album.song, id, patch),
          },
        }
      : data,
  );
  queryClient.setQueriesData<PlaylistData>(
    { queryKey: ["playlist"] },
    (data) =>
      data?.playlist?.entry
        ? {
            ...data,
            playlist: {
              ...data.playlist,
              entry: patchChildren(data.playlist.entry, id, patch),
            },
          }
        : data,
  );
  queryClient.setQueriesData<Starred2Data>(
    { queryKey: ["starred2"] },
    (data) =>
      data?.starred2?.song
        ? {
            ...data,
            starred2: {
              ...data.starred2,
              song: patchChildren(data.starred2.song, id, patch),
            },
          }
        : data,
  );
};

const patchStarred2 = (
  queryClient: QueryClient,
  patch: (starred2: Starred2) => Starred2,
) => {
  queryClient.setQueriesData<Starred2Data>(
    { queryKey: ["starred2"] },
    (data) =>
      data?.starred2 ? { ...data, starred2: patch(data.starred2) } : data,
  );
};

const applyStar = (
  queryClient: QueryClient,
  target: Extract<OfflineAction, { type: "star" }>["target"],
  starred: boolean,
) => {
  const stamp = starred ? now() : undefined;
  switch (target.kind) {
    case "song": {
      useQueue.getState().updateTrack(target.id, { starred: stamp });
      patchSongEverywhere(queryClient, target.id, { starred: stamp });
      if (starred) {
        const child = findChildInCaches(queryClient, target.id);
        if (child) {
          patchStarred2(queryClient, (starred2) =>
            starred2.song?.some((s) => s.id === target.id)
              ? starred2
              : {
                  ...starred2,
                  song: [
                    { ...child, starred: stamp },
                    ...(starred2.song ?? []),
                  ],
                },
          );
        }
      } else {
        patchStarred2(queryClient, (starred2) => ({
          ...starred2,
          song: starred2.song?.filter((s) => s.id !== target.id),
        }));
      }
      break;
    }
    case "album": {
      let album: AlbumID3 | undefined;
      queryClient.setQueriesData<AlbumData>(
        { queryKey: ["album", target.id] },
        (data) => {
          if (!data?.album) return data;
          album = data.album;
          return { ...data, album: { ...data.album, starred: stamp } };
        },
      );
      if (starred) {
        if (album) {
          const starredAlbum = { ...album, starred: stamp };
          patchStarred2(queryClient, (starred2) =>
            starred2.album?.some((a) => a.id === target.id)
              ? starred2
              : {
                  ...starred2,
                  album: [starredAlbum, ...(starred2.album ?? [])],
                },
          );
        }
      } else {
        patchStarred2(queryClient, (starred2) => ({
          ...starred2,
          album: starred2.album?.filter((a) => a.id !== target.id),
        }));
      }
      break;
    }
    case "artist": {
      let artist: ArtistID3 | undefined;
      queryClient.setQueriesData<ArtistData>(
        { queryKey: ["artist", target.id] },
        (data) => {
          if (!data?.artist) return data;
          artist = data.artist;
          return { ...data, artist: { ...data.artist, starred: stamp } };
        },
      );
      if (starred) {
        if (artist) {
          const starredArtist = { ...artist, starred: stamp };
          patchStarred2(queryClient, (starred2) =>
            starred2.artist?.some((a) => a.id === target.id)
              ? starred2
              : {
                  ...starred2,
                  artist: [starredArtist, ...(starred2.artist ?? [])],
                },
          );
        }
      } else {
        patchStarred2(queryClient, (starred2) => ({
          ...starred2,
          artist: starred2.artist?.filter((a) => a.id !== target.id),
        }));
      }
      break;
    }
  }
};

const applySetRating = (
  queryClient: QueryClient,
  id: string,
  rating: number,
) => {
  const userRating = rating > 0 ? rating : undefined;
  patchSongEverywhere(queryClient, id, { userRating });
  queryClient.setQueriesData<AlbumData>({ queryKey: ["album", id] }, (data) =>
    data?.album ? { ...data, album: { ...data.album, userRating } } : data,
  );
  queryClient.setQueriesData<ArtistData>(
    { queryKey: ["artist", id] },
    (data) =>
      data?.artist ? { ...data, artist: { ...data.artist, userRating } } : data,
  );
};

const patchPlaylistLists = (
  queryClient: QueryClient,
  playlistId: string,
  patch: (playlist: Playlist) => Playlist,
) => {
  queryClient.setQueriesData<PlaylistsData>(
    { queryKey: ["playlists"] },
    (data) =>
      data?.playlists?.playlist
        ? {
            ...data,
            playlists: {
              ...data.playlists,
              playlist: data.playlists.playlist.map((p) =>
                p.id === playlistId ? patch(p) : p,
              ),
            },
          }
        : data,
  );
};

const applyPlaylistAddSongs = (
  queryClient: QueryClient,
  playlistId: string,
  songIds: string[],
) => {
  const children = songIds.map((songId) => ({
    songId,
    child: findChildInCaches(queryClient, songId),
  }));
  const addedDuration = children.reduce(
    (sum, { child }) => sum + (child?.duration ?? 0),
    0,
  );
  queryClient.setQueriesData<PlaylistData>(
    { queryKey: ["playlist", playlistId] },
    (data) =>
      data?.playlist
        ? {
            ...data,
            playlist: {
              ...data.playlist,
              entry: [
                ...(data.playlist.entry ?? []),
                ...children.flatMap(({ child }) => (child ? [child] : [])),
              ],
              songCount: data.playlist.songCount + songIds.length,
              duration: data.playlist.duration + addedDuration,
            },
          }
        : data,
  );
  patchPlaylistLists(queryClient, playlistId, (p) => ({
    ...p,
    songCount: p.songCount + songIds.length,
    duration: p.duration + addedDuration,
  }));
};

const applyPlaylistRemoveSongs = (
  queryClient: QueryClient,
  playlistId: string,
  songIds: string[],
) => {
  let removedCount = 0;
  let removedDuration = 0;
  queryClient.setQueriesData<PlaylistData>(
    { queryKey: ["playlist", playlistId] },
    (data) => {
      if (!data?.playlist?.entry) return data;
      const entry = [...data.playlist.entry];
      for (const songId of songIds) {
        const index = entry.findIndex((c) => c.id === songId);
        if (index < 0) continue;
        removedCount++;
        removedDuration += entry[index].duration ?? 0;
        entry.splice(index, 1);
      }
      return {
        ...data,
        playlist: {
          ...data.playlist,
          entry,
          songCount: Math.max(0, data.playlist.songCount - removedCount),
          duration: Math.max(0, data.playlist.duration - removedDuration),
        },
      };
    },
  );
  patchPlaylistLists(queryClient, playlistId, (p) => ({
    ...p,
    songCount: Math.max(0, p.songCount - removedCount),
    duration: Math.max(0, p.duration - removedDuration),
  }));
};

const applyPlaylistEdit = (
  queryClient: QueryClient,
  action: Extract<OfflineAction, { type: "playlistEdit" }>,
) => {
  const patch = (playlist: Playlist): Playlist => ({
    ...playlist,
    ...(action.name !== undefined && { name: action.name }),
    ...(action.comment !== undefined && { comment: action.comment }),
    ...(action.isPublic !== undefined && { public: action.isPublic }),
  });
  queryClient.setQueriesData<PlaylistData>(
    { queryKey: ["playlist", action.playlistId] },
    (data) =>
      data?.playlist
        ? { ...data, playlist: { ...data.playlist, ...patch(data.playlist) } }
        : data,
  );
  patchPlaylistLists(queryClient, action.playlistId, patch);
};

const applyPlaylistDelete = (queryClient: QueryClient, playlistId: string) => {
  queryClient.setQueriesData<PlaylistsData>(
    { queryKey: ["playlists"] },
    (data) =>
      data?.playlists?.playlist
        ? {
            ...data,
            playlists: {
              ...data.playlists,
              playlist: data.playlists.playlist.filter(
                (p) => p.id !== playlistId,
              ),
            },
          }
        : data,
  );
  queryClient.removeQueries({ queryKey: ["playlist", playlistId] });
  usePlaylistsStore.getState().clearPlaylistTrackOrder(playlistId);
};

export function applyOptimistic(
  queryClient: QueryClient,
  action: OfflineAction,
): void {
  switch (action.type) {
    case "star":
      applyStar(queryClient, action.target, action.starred);
      break;
    case "setRating":
      applySetRating(queryClient, action.id, action.rating);
      break;
    case "playlistAddSongs":
      applyPlaylistAddSongs(queryClient, action.playlistId, action.songIds);
      break;
    case "playlistRemoveSongs":
      applyPlaylistRemoveSongs(queryClient, action.playlistId, action.songIds);
      break;
    case "playlistEdit":
      applyPlaylistEdit(queryClient, action);
      break;
    case "playlistDelete":
      applyPlaylistDelete(queryClient, action.playlistId);
      break;
  }
}
