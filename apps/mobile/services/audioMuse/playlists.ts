import { audioMuseRequest } from "@/services/audioMuse";

// Asks AudioMuse to create the playlist on the media server itself, with the
// credentials it was set up with. The alternative — the app's own
// services/backend/playlists.createPlaylist — writes it as the signed-in user
// and works on every backend; which one runs is the `saveTarget` preference in
// stores/audioMuse.ts.
export async function createAudioMusePlaylist(
  name: string,
  trackIds: string[],
): Promise<void> {
  await audioMuseRequest("/api/create_playlist", {
    method: "post",
    data: { playlist_name: name, track_ids: trackIds },
  });
}
