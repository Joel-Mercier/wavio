import { getRandomSongs } from "@/services/backend/lists";
import {
  type GeneratedMix,
  MIX_TARGET,
  topArtistNames,
} from "@/services/mixes/artistMix";
import { adaptiveArtistCap, curateMix } from "@/services/mixes/curate";

// Over-fetched so the per-artist and per-album caps have room to work: a genre
// dominated by a few prolific artists would otherwise leave a short mix.
const CANDIDATE_COUNT = 200;

export async function generateGenreMix(
  genre: string,
  { musicFolderId, rand }: { musicFolderId?: string; rand: () => number },
): Promise<GeneratedMix> {
  const rsp = await getRandomSongs({
    genre,
    size: CANDIDATE_COUNT,
    musicFolderId,
  });
  const candidates = rsp.songs?.song ?? [];
  const tracks = curateMix(
    candidates,
    {
      target: MIX_TARGET,
      maxPerArtist: adaptiveArtistCap(candidates, MIX_TARGET, {
        floor: 2,
        ceiling: 5,
      }),
      maxPerAlbum: 2,
      minSpacing: 3,
    },
    rand,
  );
  return { tracks, featuredArtists: topArtistNames(tracks) };
}
