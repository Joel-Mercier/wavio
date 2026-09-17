import { queryClient } from "@/config/queryClient";
import { getAlbum } from "@/services/backend/browsing";
import { getIsEffectivelyOnline } from "@/services/network";
import type { AlbumWithSongsID3, Child } from "@/services/openSubsonic/types";
import { playTracks } from "@/services/player";
import type { QueueSource } from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import { childToTrack } from "@/utils/childToTrack";
import { logError } from "@/utils/log";

type AlbumResponse = { album?: AlbumWithSongsID3 };

async function resolveAlbum(
  albumId: string,
): Promise<AlbumWithSongsID3 | undefined> {
  const queryKey = ["album", albumId];
  const cached = queryClient.getQueryData<AlbumResponse>(queryKey);
  if (cached?.album?.song?.length) return cached.album;
  if (!getIsEffectivelyOnline()) return undefined;
  try {
    const fresh = await queryClient.fetchQuery({
      queryKey,
      queryFn: () => getAlbum(albumId),
    });
    return fresh?.album;
  } catch (e) {
    logError(e);
    return undefined;
  }
}

// Plays `songId` with its whole album as the queue context, starting at that
// song — the same queue tapping it inside the album screen builds. False when
// the album can't be resolved (offline without a cached copy, or a song the
// album no longer lists) so the caller can pick its own fallback.
export async function playAlbumFromSong(
  songId: string,
  albumId: string | undefined,
): Promise<boolean> {
  const album = albumId ? await resolveAlbum(albumId) : undefined;
  const songs = album?.song ?? [];
  const index = songs.findIndex((s) => s.id === songId);
  if (!album || index < 0) return false;
  const source: QueueSource = {
    type: "album",
    id: album.id,
    name: album.name,
    coverArt: album.coverArt,
  };
  const started = playTracks(songs.map(childToTrack), index, { source });
  if (started) {
    useRecentPlays.getState().addRecentPlay({
      id: album.id,
      title: album.name,
      type: "album",
      coverArt: album.coverArt,
    });
  }
  return started;
}

export async function playSongInAlbum(song: Child): Promise<boolean> {
  if (await playAlbumFromSong(song.id, song.albumId)) return true;
  return playTracks([childToTrack(song)], 0);
}
