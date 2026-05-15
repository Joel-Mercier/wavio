import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  scrobble,
  setRating,
  star,
  unstar,
} from "@/services/backend/mediaAnnotation";
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
  ["similarSongs2"],
  ["topSongs"],
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
  const query = useMutation({
    mutationFn: (params: { id: string; rating: number }) => {
      const { id, rating } = params;
      return setRating(id, rating);
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
      return star(params);
    },
    onSuccess: () => {
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
      return unstar(params);
    },
    onSuccess: () => {
      invalidateKeys(queryClient, STARRED_AFFECTED_KEYS);
    },
  });

  return query;
};
