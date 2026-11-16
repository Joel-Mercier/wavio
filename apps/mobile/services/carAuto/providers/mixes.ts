import { getArtist, getGenres } from "@/services/backend/browsing";
import { getRandomSongs } from "@/services/backend/lists";
import { generateArtistMix } from "@/services/mixes/artistMix";
import { generateGenreMix } from "@/services/mixes/genreMix";
import type { QueueSource, QueueTrack } from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import { childToTrack } from "@/utils/childToTrack";
import { encodeMediaId, type MixKind } from "../mediaId";
import { cover, t } from "../nodes";
import type { BrowseNode } from "../types";
import { folderIds, type Listing } from "./shared";

const SHUFFLE_SIZE = 200;
const MIX_SUGGESTIONS = 6;

export async function mixesListing(): Promise<Listing> {
  const shuffle: BrowseNode = {
    id: encodeMediaId({ kind: "mix", mix: "shuffleAll" }),
    title: t("shuffleAll"),
    playable: true,
    icon: "shuffle",
  };
  const artists = useRecentPlays
    .getState()
    .recentPlays.filter((play) => play.type === "artist")
    .slice(0, MIX_SUGGESTIONS)
    .map(
      (play): BrowseNode => ({
        id: encodeMediaId({ kind: "mix", mix: "artist", arg: play.id }),
        title: t("artistMixOf", { artist: play.title }),
        artworkUrl: cover(play.coverArt),
        playable: true,
        groupTitle: t("artistMixes"),
      }),
    );
  const genres = await getGenres()
    .then((rsp) =>
      [...(rsp.genres?.genre ?? [])]
        .sort((a, b) => (b.songCount ?? 0) - (a.songCount ?? 0))
        .slice(0, MIX_SUGGESTIONS),
    )
    .catch(() => []);
  const genreNodes = genres.map(
    (genre): BrowseNode => ({
      id: encodeMediaId({ kind: "mix", mix: "genre", arg: genre.value }),
      title: t("genreMixOf", { genre: genre.value }),
      playable: true,
      groupTitle: t("genreMixes"),
    }),
  );
  return { nodes: [shuffle, ...artists, ...genreNodes] };
}

export async function mixTracks(
  mix: MixKind,
  arg?: string,
): Promise<{ tracks: QueueTrack[]; source: QueueSource } | null> {
  const musicFolderIds = folderIds();
  if (mix === "shuffleAll" || mix === "random") {
    const rsp = await getRandomSongs({ size: SHUFFLE_SIZE, musicFolderIds });
    return {
      tracks: (rsp.songs?.song ?? []).map(childToTrack),
      source: { type: "mix", name: t("shuffleAll") },
    };
  }
  if (!arg) return null;
  if (mix === "genre") {
    const generated = await generateGenreMix(arg, {
      musicFolderIds,
      rand: Math.random,
    });
    return {
      tracks: generated.tracks.map(childToTrack),
      source: { type: "mix", name: t("genreMixOf", { genre: arg }) },
    };
  }
  const { artist } = await getArtist(arg);
  const generated = await generateArtistMix(
    { id: artist.id, name: artist.name, musicBrainzId: artist.musicBrainzId },
    { musicFolderIds, rand: Math.random },
  );
  return {
    tracks: generated.tracks.map(childToTrack),
    source: { type: "mix", name: t("artistMixOf", { artist: artist.name }) },
  };
}
