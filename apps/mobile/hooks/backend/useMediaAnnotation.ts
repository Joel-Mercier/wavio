import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  scrobble,
  setRating,
  star,
  unstar,
} from "@/services/backend/mediaAnnotation";
import useQueue from "@/stores/queue";
import { invalidateKeys } from "@/utils/invalidateKeys";

// Star/unstar changes the `starred` field on any cached Child/AlbumID3/ArtistID3,
// so every query that returns those needs a refetch to reflect the new state in
// the UI (track rows in playlists/albums, album/artist headers, search,
// favorites list, etc.).
const STARRED_AFFECTED_KEYS = [
  ["starred"],
  ["starred2"],
  ["album"],
  ["albumList"],
  ["albumList2"],
  ["albumList2:infinite"],
  ["playlist"],
  ["playlists"],
  ["artist"],
  ["artists"],
  ["search3"],
  ["randomSongs"],
  ["songsByGenre"],
  ["mostPlayedSongs"],
  ["mostPlayedSongs:infinite"],
  ["similarSongs2"],
  ["topSongs"],
] as const;

// Rating changes the `userRating` field on cached Child/AlbumID3/ArtistID3 (and,
// for the local backend, which albums the rating-sorted "highest" list returns),
// so the same rating-stamped surfaces need a refetch.
const RATING_AFFECTED_KEYS = [
  ["album"],
  ["albumList"],
  ["albumList2"],
  ["albumList2:infinite"],
  ["artist"],
  ["artists"],
  ["playlist"],
  ["search3"],
  ["randomSongs"],
  ["songsByGenre"],
  ["mostPlayedSongs"],
  ["mostPlayedSongs:infinite"],
] as const;

export const useScrobble = () => {
  const query = useMutation({
    mutationFn: (params: {
      id: string;
      time?: number;
      submission?: boolean;
    }) => {
      const { id, time, submission } = params;
      return scrobble(id, { time, submission });
    },
  });

  return query;
};

export const useSetRating = () => {
  const queryClient = useQueryClient();
  const query = useMutation({
    mutationFn: (params: { id: string; rating: number }) => {
      const { id, rating } = params;
      return setRating(id, rating);
    },
    onSuccess: () => {
      invalidateKeys(queryClient, RATING_AFFECTED_KEYS);
    },
  });

  return query;
};

export const useStar = () => {
  const queryClient = useQueryClient();
  const query = useMutation({
    mutationFn: (params: {
      id?: string;
      albumId?: string;
      artistId?: string;
    }) => {
      if (!params.id && !params.albumId && !params.artistId) {
        throw new Error("star requires an id, albumId or artistId");
      }
      return star(params);
    },
    onSuccess: (_data, params) => {
      if (params.id && !params.albumId && !params.artistId) {
        useQueue
          .getState()
          .updateTrack(params.id, { starred: new Date().toISOString() });
      }
      invalidateKeys(queryClient, STARRED_AFFECTED_KEYS);
    },
  });

  return query;
};

export const useUnstar = () => {
  const queryClient = useQueryClient();
  const query = useMutation({
    mutationFn: (params: {
      id?: string;
      albumId?: string;
      artistId?: string;
    }) => {
      if (!params.id && !params.albumId && !params.artistId) {
        throw new Error("unstar requires an id, albumId or artistId");
      }
      return unstar(params);
    },
    onSuccess: (_data, params) => {
      if (params.id && !params.albumId && !params.artistId) {
        useQueue.getState().updateTrack(params.id, { starred: undefined });
      }
      invalidateKeys(queryClient, STARRED_AFFECTED_KEYS);
    },
  });

  return query;
};
