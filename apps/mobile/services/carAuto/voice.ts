import { play, startTrackRadio } from "@/services/player";
import useQueue from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import { childToTrack } from "@/utils/childToTrack";
import { encodeMediaId } from "./mediaId";
import { collectionFor, playCollection, playMediaId } from "./play";
import { mixTracks } from "./providers/mixes";
import { matches, type SearchHits, searchHits } from "./providers/search";

export type VoiceHints = {
  artist?: string;
  album?: string;
  genre?: string;
  playlist?: string;
  title?: string;
};

const exact = (value: string | undefined, query: string) =>
  !!value && value.trim().toLowerCase() === query.trim().toLowerCase();

async function playDefault(): Promise<boolean> {
  const queue = useQueue.getState();
  if (queue.getCurrent()) {
    play();
    return true;
  }
  const recent = useRecentPlays
    .getState()
    .recentPlays.find((entry) => entry.type !== "favorites");
  if (recent) {
    const mediaId =
      recent.type === "internetRadioStation"
        ? encodeMediaId({ kind: "radioStation", id: recent.id })
        : recent.type === "album"
          ? encodeMediaId({ kind: "album", id: recent.id })
          : recent.type === "playlist"
            ? encodeMediaId({ kind: "playlist", id: recent.id })
            : encodeMediaId({ kind: "artist", id: recent.id });
    if (await playMediaId(mediaId)) return true;
  }
  return playCollection(await mixTracks("shuffleAll"));
}

async function playHit(
  hits: SearchHits,
  query: string,
  hints: VoiceHints,
): Promise<boolean> {
  const playlist =
    hits.playlists.find((candidate) => exact(candidate.name, query)) ??
    (hints.playlist ? hits.playlists[0] : undefined);
  if (playlist) {
    return playMediaId(encodeMediaId({ kind: "playlist", id: playlist.id }));
  }
  // An artist named with no album or title is a request for that artist, even
  // when a self-titled album or song matches the spoken words exactly.
  const artistOnly = !!hints.artist && !hints.album && !hints.title;
  const albumQuery = hints.album ?? query;
  const album = artistOnly
    ? undefined
    : (hits.albums.find(
        (candidate) =>
          exact(candidate.name, albumQuery) &&
          (!hints.artist || matches(candidate.artist, hints.artist)),
      ) ?? (hints.album ? hits.albums[0] : undefined));
  if (album) return playMediaId(encodeMediaId({ kind: "album", id: album.id }));

  const titleQuery = hints.title ?? query;
  const song = artistOnly
    ? undefined
    : (hits.songs.find(
        (candidate) =>
          exact(candidate.title, titleQuery) &&
          (!hints.artist || matches(candidate.artist, hints.artist)),
      ) ?? (hints.title ? hits.songs[0] : undefined));
  if (song) return startTrackRadio(childToTrack(song));

  const artist =
    hits.artists.find((candidate) =>
      exact(candidate.name, hints.artist ?? query),
    ) ?? hits.artists[0];
  if (artist) {
    return playMediaId(encodeMediaId({ kind: "artist", id: artist.id }), {
      shuffle: true,
    });
  }
  if (hits.songs[0]) return startTrackRadio(childToTrack(hits.songs[0]));
  if (hits.albums[0]) {
    return playMediaId(encodeMediaId({ kind: "album", id: hits.albums[0].id }));
  }
  if (hits.playlists[0]) {
    return playMediaId(
      encodeMediaId({ kind: "playlist", id: hits.playlists[0].id }),
    );
  }
  return false;
}

export async function playFromSearch(
  rawQuery: string,
  hints: VoiceHints = {},
): Promise<boolean> {
  const query = rawQuery.trim();
  const hasHints = Object.values(hints).some(Boolean);
  if (!query && !hasHints) return playDefault();
  try {
    if (hints.genre && !hints.artist && !hints.album && !hints.title) {
      return playCollection(
        await collectionFor({ kind: "genre", name: hints.genre }),
      );
    }
    const searchTerm =
      hints.title ?? hints.album ?? hints.playlist ?? hints.artist ?? query;
    const hits = await searchHits(searchTerm);
    if (await playHit(hits, query || searchTerm, hints)) return true;
    if (searchTerm !== query && query) {
      return playHit(await searchHits(query), query, hints);
    }
    return false;
  } catch {
    return false;
  }
}
