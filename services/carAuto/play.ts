import { playTracks } from "@/services/player";
import { resolveTracksForMediaId } from "./tree";

export async function handleBrowsePlay(mediaId: string): Promise<boolean> {
  try {
    const tracks = await resolveTracksForMediaId(mediaId);
    if (!tracks || tracks.length === 0) return false;
    playTracks(tracks, 0);
    return true;
  } catch {
    return false;
  }
}
