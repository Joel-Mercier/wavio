import {
  getAlbum,
  getArtist,
  getTopSongs,
} from "@/services/openSubsonic/browsing";
import { getStarred2 } from "@/services/openSubsonic/lists";
import { getPlaylist, getPlaylists } from "@/services/openSubsonic/playlists";
import type { Child } from "@/services/openSubsonic/types";
import type { QueueTrack } from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";
import type { BrowseNode, BrowseTree } from "./types";

// In-memory snapshot used by play.ts to resolve leaf mediaIds without
// refetching. Refreshed every time buildBrowseTree() runs.
type Snapshot = {
  starredSongs: Map<string, Child>;
};

const snapshot: Snapshot = {
  starredSongs: new Map(),
};

export const getSnapshot = () => snapshot;

const childToNode = (child: Child, idPrefix: string): BrowseNode => ({
  id: `${idPrefix}:${child.id}`,
  title: child.title ?? "Unknown",
  subtitle: child.artist,
  artworkUrl: child.coverArt ? artworkUrl(child.coverArt) : undefined,
  playable: true,
});

export async function buildBrowseTree(): Promise<BrowseTree> {
  const [playlistsRsp, starredRsp] = await Promise.all([
    getPlaylists({}).catch(() => null),
    getStarred2({}).catch(() => null),
  ]);

  const playlists: BrowseNode[] =
    playlistsRsp?.playlists?.playlist?.map((p) => ({
      id: `playlist:${p.id}`,
      title: p.name,
      subtitle: p.songCount ? `${p.songCount} songs` : undefined,
      artworkUrl: p.coverArt ? artworkUrl(p.coverArt) : undefined,
      playable: true,
    })) ?? [];

  const starredData = starredRsp?.starred2;
  snapshot.starredSongs.clear();
  for (const song of starredData?.song ?? []) {
    snapshot.starredSongs.set(song.id, song);
  }
  const starred: BrowseNode[] = [
    ...(starredData?.song?.map((s) => childToNode(s, "starred-song")) ?? []),
    ...(starredData?.album?.map((a) => ({
      id: `starred-album:${a.id}`,
      title: a.name,
      subtitle: a.artist,
      artworkUrl: a.coverArt ? artworkUrl(a.coverArt) : undefined,
      playable: true,
    })) ?? []),
    ...(starredData?.artist?.map((a) => ({
      id: `starred-artist:${a.id}`,
      title: a.name,
      playable: true,
    })) ?? []),
  ];

  // Recent plays: items reference albums/artists/playlists/favorites/radio.
  // We map them to playable mediaIds; resolution happens lazily in play.ts.
  const recentPlays = useRecentPlays.getState().recentPlays;
  const recent: BrowseNode[] = recentPlays
    // Skip favorites pseudo-entry; the "Starred" section already covers it.
    .filter((p) => p.type !== "favorites")
    .map((p) => ({
      id: `recent:${p.type}:${p.id}`,
      title: p.title,
      artworkUrl: p.coverArt ? artworkUrl(p.coverArt) : undefined,
      playable: true,
    }));

  return { recent, playlists, starred };
}

// Tracks resolvers exposed for play.ts so that it can build a QueueTrack[]
// from a leaf mediaId. Returns null when the id isn't recognised.
export async function resolveTracksForMediaId(
  mediaId: string,
): Promise<QueueTrack[] | null> {
  if (mediaId.startsWith("playlist:")) {
    const id = mediaId.slice("playlist:".length);
    const rsp = await getPlaylist(id);
    const entries = rsp.playlist.entry ?? [];
    return entries.map(childToTrack);
  }
  if (mediaId.startsWith("starred-song:")) {
    const id = mediaId.slice("starred-song:".length);
    const song = snapshot.starredSongs.get(id);
    return song ? [childToTrack(song)] : null;
  }
  if (
    mediaId.startsWith("starred-album:") ||
    mediaId.startsWith("recent:album:")
  ) {
    const id = mediaId.split(":").pop() ?? "";
    const rsp = await getAlbum(id);
    const songs = rsp.album.song ?? [];
    return songs.map(childToTrack);
  }
  if (
    mediaId.startsWith("starred-artist:") ||
    mediaId.startsWith("recent:artist:")
  ) {
    const id = mediaId.split(":").pop() ?? "";
    const artistRsp = await getArtist(id);
    const artistName = artistRsp.artist.name;
    if (!artistName) return null;
    const topRsp = await getTopSongs(artistName, {});
    const songs = topRsp.topSongs.song ?? [];
    return songs.map(childToTrack);
  }
  if (mediaId.startsWith("recent:playlist:")) {
    const id = mediaId.slice("recent:playlist:".length);
    return resolveTracksForMediaId(`playlist:${id}`);
  }
  return null;
}
