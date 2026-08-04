import { getAlbum, getArtist, getSong } from "@/services/backend/browsing";
import { getStarred2 } from "@/services/backend/lists";
import { getPlaylist } from "@/services/backend/playlists";
import { playTracks } from "@/services/player";
import { fetchTopSongs, supportsTopSongsById } from "@/services/topSongs";
import type { QueueTrack } from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
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
      // Snapshot miss. Android Auto can browse a tree the native side restored
      // from disk into a process where JS has only just booted, so the tap
      // routinely lands before buildBrowseTree() has repopulated anything.
      // Fetch the collection instead of dropping the tap.
      const fromServer = await playParentFromServer(
        parsed.songId,
        effectiveParent,
      );
      if (fromServer) return true;
    }
    const tracks = await resolveTracksForMediaId(mediaId);
    if (tracks && tracks.length > 0) return playTracks(tracks, 0);
    // Parents that aren't tracklists (home sections, library folders) can't be
    // enqueued around the tap — play the song on its own rather than nothing.
    const songId = parsed?.songId ?? legacyTrackId(mediaId);
    if (songId) return playSongById(songId);
    return false;
  } catch {
    return false;
  }
}

// Resolve the tapped track's collection from the backend and start at it.
// Parents that don't resolve to a tracklist (a grid of albums, a library
// folder) yield nothing and leave the queue alone.
async function playParentFromServer(
  songId: string,
  parentId: string,
): Promise<boolean> {
  const tracks = await resolveTracksForMediaId(parentId).catch(() => null);
  if (!tracks || tracks.length === 0) return false;
  const index = tracks.findIndex((t) => t.id === songId);
  return playTracks(tracks, Math.max(0, index));
}

// `track:<id>` ids predate the parent-embedding format and can still be sitting
// in a browse tree the native side restored from disk.
function legacyTrackId(mediaId: string): string | null {
  return mediaId.startsWith("track:")
    ? mediaId.slice("track:".length) || null
    : null;
}

async function playSongById(songId: string): Promise<boolean> {
  const rsp = await getSong(songId).catch(() => null);
  if (!rsp?.song) return false;
  return playTracks([childToTrack(rsp.song)], 0);
}

// Enqueue the parent's playable children, start at the tapped one. Returns
// false if the parent isn't a tracklist we can resolve (e.g. user tapped a
// track inside a non-track grouping), or if nothing in it can play right now —
// the head unit must not be told playback started when the queue was left as-is.
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
  return playTracks(tracks, Math.min(startIndex, tracks.length - 1));
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
      if (songs.length > 0) return songs.map(childToTrack);
      const rsp = await getStarred2({});
      const starred = rsp.starred2?.song ?? [];
      return starred.length > 0 ? starred.map(childToTrack) : null;
    }
    case "radio": {
      // Radio nodes only ever come from the recent plays store (tree.ts). That
      // store is `skipHydration`, so a cold start only resolves this because
      // session.ts rehydrates it before answering the car — see
      // services/startupHydration.ts.
      const station = useRecentPlays
        .getState()
        .recentPlays.find(
          (p) => p.type === "internetRadioStation" && p.id === id,
        );
      if (!station?.streamUrl) return null;
      return [
        {
          id: station.id,
          url: station.streamUrl,
          title: station.title,
          artwork: station.coverArt,
          artist: station.homePageUrl,
          isRadio: true,
          streamUrl: station.streamUrl,
          homePageUrl: station.homePageUrl,
          source: station.source,
        },
      ];
    }
    case "artist": {
      const cachedTop = snap.artistTopSongs.get(id);
      if (cachedTop && cachedTop.length > 0) return cachedTop.map(childToTrack);
      // getArtist is only ever fetched here to read a name, so servers that can
      // resolve top songs from the id skip that round-trip entirely.
      if (supportsTopSongsById()) {
        const songs = await fetchTopSongs({ id, count: 10 });
        return songs.map(childToTrack);
      }
      const artistRsp = await getArtist(id);
      const name = artistRsp.artist.name;
      if (!name) return null;
      const songs = await fetchTopSongs({ name, count: 10 });
      return songs.map(childToTrack);
    }
    default:
      return null;
  }
}
