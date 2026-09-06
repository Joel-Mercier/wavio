import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  scrobble,
  setRating,
  star,
  unstar,
} from "@/services/backend/mediaAnnotation";
import { enqueueLove } from "@/services/lastFm/scrobbler";
import { getIsEffectivelyOnline } from "@/services/network";
import {
  enqueueOfflineMutation,
  isQueuedResult,
} from "@/services/offlineMutations/enqueue";
import type { StarTarget } from "@/stores/offlineMutations";
import useQueue from "@/stores/queue";
import { invalidateKeys } from "@/utils/invalidateKeys";

// Star/unstar changes the `starred` field on any cached Child/AlbumID3/ArtistID3,
// so every query that returns those needs a refetch to reflect the new state in
// the UI (track rows in playlists/albums, album/artist headers, search,
// favorites list, etc.).
export const STARRED_AFFECTED_KEYS = [
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
export const RATING_AFFECTED_KEYS = [
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
    // "always": the default "online" mode would pause the mutation before
    // mutationFn runs, so the offline enqueue branch would never execute.
    networkMode: "always",
    mutationFn: async (params: { id: string; rating: number }) => {
      const { id, rating } = params;
      if (!getIsEffectivelyOnline()) {
        return enqueueOfflineMutation(queryClient, {
          type: "setRating",
          id,
          rating,
        });
      }
      return setRating(id, rating);
    },
    onSuccess: (data, params) => {
      if (isQueuedResult(data)) return;
      useQueue.getState().updateTrack(params.id, {
        userRating: params.rating > 0 ? params.rating : undefined,
      });
      invalidateKeys(queryClient, RATING_AFFECTED_KEYS);
    },
  });

  return query;
};

type StarParams = {
  id?: string;
  albumId?: string;
  artistId?: string;
  /**
   * The song's own metadata, for the scrobbling integrations that identify a
   * track by name rather than by server id. Optional because album/artist stars
   * have no Last.fm equivalent, and because a caller that doesn't have it is
   * still allowed to star.
   */
  song?: { title?: string; artist?: string };
};

const toStarTarget = (params: StarParams): StarTarget => {
  if (params.albumId) return { kind: "album", id: params.albumId };
  if (params.artistId) return { kind: "artist", id: params.artistId };
  return { kind: "song", id: params.id as string };
};

/**
 * Mirrors a favourite to Last.fm.
 *
 * Deliberately runs even when the star itself was only queued offline: the love
 * queue drains on *device* connectivity, whereas a star is queued whenever the
 * music server is unreachable — which on a LAN server or a local library is a
 * different thing entirely. Waiting for the star to land would silently drop
 * loves in exactly the setup this integration is most useful for.
 */
const relayLove = (params: StarParams, loved: boolean) => {
  if (!params.id || params.albumId || params.artistId) return;
  if (!params.song?.title || !params.song?.artist) return;
  enqueueLove(params.song.artist, params.song.title, loved);
};

export const useStar = () => {
  const queryClient = useQueryClient();
  const query = useMutation({
    networkMode: "always",
    mutationFn: async (params: StarParams) => {
      if (!params.id && !params.albumId && !params.artistId) {
        throw new Error("star requires an id, albumId or artistId");
      }
      if (!getIsEffectivelyOnline()) {
        return enqueueOfflineMutation(queryClient, {
          type: "star",
          target: toStarTarget(params),
          starred: true,
        });
      }
      return star(params);
    },
    onSuccess: (data, params) => {
      relayLove(params, true);
      if (isQueuedResult(data)) return;
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
    networkMode: "always",
    mutationFn: async (params: StarParams) => {
      if (!params.id && !params.albumId && !params.artistId) {
        throw new Error("unstar requires an id, albumId or artistId");
      }
      if (!getIsEffectivelyOnline()) {
        return enqueueOfflineMutation(queryClient, {
          type: "star",
          target: toStarTarget(params),
          starred: false,
        });
      }
      return unstar(params);
    },
    onSuccess: (data, params) => {
      relayLove(params, false);
      if (isQueuedResult(data)) return;
      if (params.id && !params.albumId && !params.artistId) {
        useQueue.getState().updateTrack(params.id, { starred: undefined });
      }
      invalidateKeys(queryClient, STARRED_AFFECTED_KEYS);
    },
  });

  return query;
};
