import axios from "axios";
import { queryClient } from "@/config/queryClient";
import {
  RATING_AFFECTED_KEYS,
  STARRED_AFFECTED_KEYS,
} from "@/hooks/backend/useMediaAnnotation";
import { setRating, star, unstar } from "@/services/backend/mediaAnnotation";
import {
  deletePlaylist,
  getPlaylist,
  updatePlaylist,
} from "@/services/backend/playlists";
import { isNetworkNoise, reportError } from "@/services/errorReporting";
import {
  getIsEffectivelyOnline,
  subscribeEffectiveOnline,
} from "@/services/network";
import { isSubsonicDataNotFound } from "@/services/openSubsonic";
import { useAuthBase } from "@/stores/auth";
import useOfflineMutations, {
  playlistIdOf,
  type QueuedMutation,
} from "@/stores/offlineMutations";
import { invalidateKeys } from "@/utils/invalidateKeys";

const REPLAY_DELAY_MS = 200;
const MAX_ATTEMPTS = 3;
const BACKOFF_STEPS_MS = [30_000, 60_000, 120_000, 300_000];

const PLAYLIST_AFFECTED_KEYS = [["playlist"], ["playlists"]] as const;

export type DrainResult = { dropped: number };

let started = false;
let unsubscribeOnline: (() => void) | null = null;
let lastEffectiveOnline = false;
let draining = false;
let drainRequested = false;
let generation = 0;
let backoffTimer: ReturnType<typeof setTimeout> | null = null;
let backoffLevel = 0;
// Adds that were mid-request when the app last died: the server may or may not
// have applied them, and adding twice duplicates the entry — so these fetch the
// playlist first and only send the songs that aren't already there.
const suspectAdds = new Set<string>();
const drainListeners = new Set<(result: DrainResult) => void>();

export function subscribeDrainResult(
  cb: (result: DrainResult) => void,
): () => void {
  drainListeners.add(cb);
  return () => {
    drainListeners.delete(cb);
  };
}

const notifyDrainResult = (result: DrainResult) => {
  for (const cb of drainListeners) cb(result);
};

const clearBackoffTimer = () => {
  if (backoffTimer) {
    clearTimeout(backoffTimer);
    backoffTimer = null;
  }
};

const scheduleBackoff = () => {
  if (backoffTimer) return;
  const delay =
    BACKOFF_STEPS_MS[Math.min(backoffLevel, BACKOFF_STEPS_MS.length - 1)];
  backoffLevel++;
  backoffTimer = setTimeout(() => {
    backoffTimer = null;
    void drainOfflineMutations();
  }, delay);
};

const httpStatus = (error: unknown): number | undefined =>
  axios.isAxiosError(error) ? error.response?.status : undefined;

const subsonicCode = (error: unknown): number | undefined =>
  error && typeof error === "object"
    ? (error as { code?: number }).code
    : undefined;

const isNotFoundError = (error: unknown) =>
  isSubsonicDataNotFound(error) || httpStatus(error) === 404;

const isAuthError = (error: unknown) => {
  const status = httpStatus(error);
  return subsonicCode(error) === 40 || status === 401;
};

const isPermanentError = (error: unknown) => {
  const status = httpStatus(error);
  if (status !== undefined && status >= 400 && status < 500) return true;
  const code = subsonicCode(error);
  return code === 50 || code === 70;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function executeAction(item: QueuedMutation): Promise<void> {
  const { action } = item;
  switch (action.type) {
    case "star": {
      const { target } = action;
      const params =
        target.kind === "album"
          ? { albumId: target.id }
          : target.kind === "artist"
            ? { artistId: target.id }
            : { id: target.id };
      if (action.starred) await star(params);
      else await unstar(params);
      return;
    }
    case "setRating": {
      await setRating(action.id, action.rating);
      return;
    }
    case "playlistAddSongs": {
      let songIds = action.songIds;
      if (suspectAdds.has(item.id)) {
        suspectAdds.delete(item.id);
        const rsp = await getPlaylist(action.playlistId);
        const existing = new Set(rsp.playlist?.entry?.map((c) => c.id));
        songIds = songIds.filter((id) => !existing.has(id));
        if (songIds.length === 0) return;
      }
      await updatePlaylist(action.playlistId, { songIdToAdd: songIds });
      return;
    }
    case "playlistRemoveSongs": {
      // Positional indices are only valid against the server's current list, so
      // resolve the queued song ids against a fresh snapshot and remove all
      // matches in one call (indices from one snapshot don't shift each other).
      const rsp = await getPlaylist(action.playlistId);
      const entry = rsp.playlist?.entry ?? [];
      const claimed = new Set<number>();
      for (const songId of action.songIds) {
        const index = entry.findIndex(
          (c, i) => c.id === songId && !claimed.has(i),
        );
        if (index >= 0) claimed.add(index);
      }
      if (claimed.size === 0) return;
      await updatePlaylist(action.playlistId, {
        songIndexToRemove: [...claimed].map(String),
      });
      return;
    }
    case "playlistEdit": {
      await updatePlaylist(action.playlistId, {
        name: action.name,
        comment: action.comment,
        isPublic: action.isPublic,
      });
      return;
    }
    case "playlistDelete": {
      try {
        await deletePlaylist(action.playlistId);
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
      }
      return;
    }
  }
}

const reportBackend = () => {
  const { serverType } = useAuthBase.getState();
  if (serverType === "jellyfin") return "jellyfin" as const;
  if (serverType === "local") return "local" as const;
  return "subsonic" as const;
};

export async function drainOfflineMutations(): Promise<void> {
  if (draining) {
    drainRequested = true;
    return;
  }
  draining = true;
  const gen = generation;
  clearBackoffTimer();
  const attempted = new Set<string>();
  const processed = { star: false, rating: false, playlist: false };
  let dropped = 0;
  try {
    while (getIsEffectivelyOnline()) {
      if (gen !== generation) return;
      const item = useOfflineMutations
        .getState()
        .queue.find((q) => q.status === "pending" && !attempted.has(q.id));
      if (!item) break;
      attempted.add(item.id);
      useOfflineMutations.getState().setStatus(item.id, "inFlight");
      try {
        await executeAction(item);
        if (gen !== generation) return;
        useOfflineMutations.getState().remove([item.id]);
        backoffLevel = 0;
      } catch (error) {
        if (gen !== generation) return;
        if (isNetworkNoise(error) || !getIsEffectivelyOnline()) {
          useOfflineMutations.getState().setStatus(item.id, "pending");
          break;
        }
        if (isAuthError(error)) {
          useOfflineMutations.getState().setStatus(item.id, "pending");
          break;
        }
        if (isPermanentError(error)) {
          const playlistId = playlistIdOf(item.action);
          if (playlistId) {
            useOfflineMutations.getState().removeForPlaylist(playlistId);
          } else {
            useOfflineMutations.getState().remove([item.id]);
          }
          dropped++;
          if (!isNotFoundError(error)) {
            reportError(error, {
              area: "api",
              backend: reportBackend(),
              endpoint: `offlineMutations.replay:${item.action.type}`,
              status: httpStatus(error) ?? subsonicCode(error),
            });
          }
        } else if (item.retryCount + 1 >= MAX_ATTEMPTS) {
          useOfflineMutations.getState().remove([item.id]);
          dropped++;
          reportError(error, {
            area: "api",
            backend: reportBackend(),
            endpoint: `offlineMutations.replay:${item.action.type}`,
            status: httpStatus(error) ?? subsonicCode(error),
          });
        } else {
          useOfflineMutations.getState().bumpRetry(item.id);
        }
        continue;
      }
      switch (item.action.type) {
        case "star":
          processed.star = true;
          break;
        case "setRating":
          processed.rating = true;
          break;
        default:
          processed.playlist = true;
      }
      await sleep(REPLAY_DELAY_MS);
    }
  } finally {
    draining = false;
  }
  if (gen !== generation) return;
  // Dropped actions also need a refetch: their optimistic cache patches never
  // made it to the server, so the caches lie until server truth comes back.
  const keys = [
    ...(processed.star || dropped > 0 ? STARRED_AFFECTED_KEYS : []),
    ...(processed.rating ? RATING_AFFECTED_KEYS : []),
    ...(processed.playlist || dropped > 0 ? PLAYLIST_AFFECTED_KEYS : []),
  ];
  if (keys.length > 0) {
    invalidateKeys(queryClient, keys);
  }
  if (dropped > 0) notifyDrainResult({ dropped });
  if (useOfflineMutations.getState().queue.length > 0) scheduleBackoff();
  if (drainRequested) {
    drainRequested = false;
    void drainOfflineMutations();
  }
}

function reconcile(): void {
  const { queue, setStatus } = useOfflineMutations.getState();
  for (const item of queue) {
    if (item.status !== "inFlight") continue;
    if (item.action.type === "playlistAddSongs") suspectAdds.add(item.id);
    setStatus(item.id, "pending");
  }
}

// Call once after the offline-mutations store has hydrated for the active
// scope: reconciles interrupted items, then drains on every offline→online
// transition (and right away if already online).
export function initOfflineMutationReplay(): void {
  if (started) return;
  started = true;
  reconcile();
  lastEffectiveOnline = getIsEffectivelyOnline();
  unsubscribeOnline = subscribeEffectiveOnline(() => {
    const online = getIsEffectivelyOnline();
    if (online && !lastEffectiveOnline) void drainOfflineMutations();
    lastEffectiveOnline = online;
  });
  if (lastEffectiveOnline) void drainOfflineMutations();
}

export function stopOfflineMutationReplay(): void {
  unsubscribeOnline?.();
  unsubscribeOnline = null;
  clearBackoffTimer();
  backoffLevel = 0;
  generation++;
  drainRequested = false;
  suspectAdds.clear();
  started = false;
}

export function resetOfflineMutationReplay(): void {
  stopOfflineMutationReplay();
}
