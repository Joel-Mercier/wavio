import { createAudioMusePlaylist } from "@/services/audioMuse/playlists";
import { createSnapshot } from "@/services/playlistSnapshot";

export type SavePlaylistTarget = "backend" | "audiomuse";

/**
 * Writes a generated track list to the server as a playlist, through whichever
 * writer `target` names. Returns the new playlist's id, or undefined for the
 * AudioMuse writer, which creates it server-side and reports no id back.
 */
export async function saveGeneratedPlaylist(
  target: SavePlaylistTarget,
  name: string,
  trackIds: string[],
): Promise<string | undefined> {
  if (target === "audiomuse") {
    await createAudioMusePlaylist(name, trackIds);
    return undefined;
  }
  // Chunked: a generated playlist can hold more track ids than a single
  // Subsonic GET can carry on its query string.
  return createSnapshot(name, trackIds);
}
