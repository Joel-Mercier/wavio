import {
  getAlbum,
  getArtist,
  getTopSongs,
} from "@/services/openSubsonic/browsing";
import { getPlaylist } from "@/services/openSubsonic/playlists";
import { playTracks } from "@/services/player";
import type { QueueTrack } from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";
import { getSnapshot } from "./tree";

// Track mediaIds carry their parent inline (`track|<parentId>|<songId>`) so
// the play resolver doesn't have to guess which collection the user was in.
function parseTrackMediaId(
  mediaId: string,
): { parentId: string; songId: string } | null {
  if (!mediaId.startsWith("track|")) return null;
  const parts = mediaId.split("|");
  if (parts.length < 3) return null;
  const parentId = parts[1];
  const songId = parts.slice(2).join("|");
  if (!parentId || !songId) return null;
  return { parentId, songId };
}

// Called when Android Auto forwards a tap. If the tap originated from inside
// a collection (album, playlist, home section, artist screen…), enqueue the
// whole collection starting at the tapped track. Otherwise fall back to the
// mediaId-only resolver below.
export async function handleBrowsePlay(
  mediaId: string,
  parentId?: string,
): Promise<boolean> {
  try {
    const parsed = parseTrackMediaId(mediaId);
    const effectiveParent = parsed?.parentId ?? parentId;
    if (parsed && effectiveParent) {
      const enqueued = await playFromParent(mediaId, effectiveParent);
      if (enqueued) return true;
    }
    const tracks = await resolveTracksForMediaId(mediaId);
    if (!tracks || tracks.length === 0) return false;
    playTracks(tracks, 0);
    return true;
  } catch {
    return false;
  }
}

// Enqueue the parent's playable children, start at the tapped one. Returns
// false if the parent isn't a tracklist we can resolve (e.g. user tapped a
// track inside a non-track grouping).
async function playFromParent(
  trackMediaId: string,
  parentId: string,
): Promise<boolean> {
  const snap = getSnapshot();
  const ids = snap.parentTracks.get(parentId);
  if (!ids || ids.length === 0) return false;
  const startIndex = Math.max(0, ids.indexOf(trackMediaId));
  const tracks: QueueTrack[] = [];
  for (const id of ids) {
    const resolved = await resolveTracksForMediaId(id);
    if (resolved && resolved.length > 0) tracks.push(...resolved);
  }
  if (tracks.length === 0) return false;
  // ids may include non-track entries (e.g. artist children mix songs +
  // albums). The startIndex from the id list still points at the right entry
  // because non-playables are filtered at recordParentTracks.
  playTracks(tracks, Math.min(startIndex, tracks.length - 1));
  return true;
}

// Resolve a leaf (or "play whole thing") mediaId to a QueueTrack[].
export async function resolveTracksForMediaId(
  mediaId: string,
): Promise<QueueTrack[] | null> {
  const snap = getSnapshot();

  const parsedTrack = parseTrackMediaId(mediaId);
  if (parsedTrack) {
    const cached = snap.tracks.get(parsedTrack.songId);
    return cached ? [childToTrack(cached)] : null;
  }

  const [prefix, ...rest] = mediaId.split(":");
  const id = rest.join(":");

  switch (prefix) {
    case "track": {
      const cached = snap.tracks.get(id);
      return cached ? [childToTrack(cached)] : null;
    }
    case "album": {
      const cached = snap.albums.get(id);
      if (cached?.song) return cached.song.map(childToTrack);
      const rsp = await getAlbum(id);
      return (rsp.album.song ?? []).map(childToTrack);
    }
    case "playlist": {
      const cached = snap.playlists.get(id);
      if (cached?.entry) return cached.entry.map(childToTrack);
      const rsp = await getPlaylist(id);
      return (rsp.playlist.entry ?? []).map(childToTrack);
    }
    case "favorites": {
      const songs = Array.from(snap.tracks.values()).filter((t) => t.starred);
      return songs.length > 0 ? songs.map(childToTrack) : null;
    }
    case "artist": {
      const cachedTop = snap.artistTopSongs.get(id);
      if (cachedTop && cachedTop.length > 0) return cachedTop.map(childToTrack);
      const artistRsp = await getArtist(id);
      const name = artistRsp.artist.name;
      if (!name) return null;
      const topRsp = await getTopSongs(name, { count: 10 });
      return (topRsp.topSongs.song ?? []).map(childToTrack);
    }
    default:
      return null;
  }
}
