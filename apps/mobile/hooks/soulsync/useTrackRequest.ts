import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { SOULSYNC_NETWORK_MODE } from "@/hooks/soulsync/networkMode";
import { soulSyncQueueKey } from "@/hooks/soulsync/useSoulSyncDownloads";
import {
  downloadMatchKey,
  fetchDownloadTasks,
  isActiveTaskStatus,
} from "@/services/soulsync/downloads";
import type {
  SoulSyncDownloadTask,
  SoulSyncTrack,
  SoulSyncWishlistTrack,
} from "@/services/soulsync/types";
import { fetchWishlist, requestTrack } from "@/services/soulsync/wishlist";
import useSoulSync from "@/stores/soulsync";

export type TrackRequestStatus =
  | "idle"
  | "pending"
  | "queued"
  | "downloading"
  | "importing"
  | "completed"
  | "failed"
  | "unknown";

const requestsKey = ["soulsync", "trackRequests"];

// The wishlist and the queue are polled together on one timer, and only while
// something is outstanding. Two calls per 5s tick is 24 req/min against the
// API's 60/min ceiling, leaving room for searches on the same screen.
const POLL_INTERVAL = 5000;
// A track that never shows up in either list is given up on rather than spun
// on forever — SoulSync accepted it but nothing we can see acted on it.
const MAX_UNSEEN_POLLS = 4;

function trackMatchKey(track: RequestedTrack) {
  return downloadMatchKey(track.name, track.artist);
}

function taskMatchKey(task: SoulSyncDownloadTask) {
  return downloadMatchKey(task.track_name, task.artist_name);
}

interface RequestedTrack {
  id: string;
  name: string;
  artist: string;
}

// Which tracks have been requested is kept outside the rows: FlashList recycles
// them, so row state would follow a recycled cell onto a different track, and
// scrolling a requested track out of view would lose it.
interface RequestRegistry {
  requested: Record<string, RequestedTrack>;
  pending: Record<string, true>;
}

let registry: RequestRegistry = { requested: {}, pending: {} };
const listeners = new Set<() => void>();

function getRegistry() {
  return registry;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(next: RequestRegistry) {
  registry = next;
  for (const listener of listeners) listener();
}

function setRequested(track: RequestedTrack) {
  emit({
    ...registry,
    requested: { ...registry.requested, [track.id]: track },
  });
}

function setPending(trackId: string, isPending: boolean) {
  const pending = { ...registry.pending };
  if (isPending) {
    pending[trackId] = true;
  } else {
    delete pending[trackId];
  }
  emit({ ...registry, pending });
}

interface PollSnapshot {
  wishlist: SoulSyncWishlistTrack[];
  tasks: SoulSyncDownloadTask[];
  // Per track: how many polls have seen it in neither list. Reset the moment it
  // turns up in either, so a slow batch doesn't trip the give-up path.
  unseen: Record<string, number>;
  // Per track: whether it has ever been observed on the wishlist or as a task.
  // Disappearing only means "downloaded" once it has been there — before that
  // it just hasn't landed yet.
  seen: Record<string, true>;
}

interface DerivedState {
  status: TrackRequestStatus;
  progress: number | null;
  errorMessage: string | null;
}

function derive(
  track: RequestedTrack,
  snapshot: PollSnapshot | undefined,
  isPending: boolean,
): DerivedState {
  if (isPending) {
    return { status: "pending", progress: null, errorMessage: null };
  }
  if (!snapshot) {
    return { status: "queued", progress: null, errorMessage: null };
  }

  const key = trackMatchKey(track);
  const task = snapshot.tasks.find((entry) => taskMatchKey(entry) === key);
  const wish = snapshot.wishlist.find(
    (entry) => entry.spotify_track_id === track.id,
  );

  if (task) {
    if (task.status === "completed") {
      return { status: "completed", progress: 100, errorMessage: null };
    }
    if (task.status === "post_processing" || task.status === "matched") {
      return {
        status: "importing",
        progress: task.progress,
        errorMessage: null,
      };
    }
    if (isActiveTaskStatus(task.status)) {
      return {
        status: task.status === "downloading" ? "downloading" : "queued",
        progress: task.progress,
        errorMessage: null,
      };
    }
    // Anything else is terminal and not a success: failed, cancelled, …
    return { status: "failed", progress: null, errorMessage: task.error };
  }

  if (wish) {
    // The batch has tried this track and it's still here, so that attempt
    // didn't produce a download. SoulSync keeps the row for a later retry.
    if (wish.last_attempted) {
      return {
        status: "failed",
        progress: null,
        errorMessage: wish.failure_reason,
      };
    }
    return { status: "queued", progress: null, errorMessage: null };
  }

  // Gone from both lists. SoulSync deletes the wishlist row on a successful
  // download, so that's a success — but only if we ever saw it there.
  if (snapshot.seen[track.id]) {
    return { status: "completed", progress: 100, errorMessage: null };
  }
  if ((snapshot.unseen[track.id] ?? 0) >= MAX_UNSEEN_POLLS) {
    return { status: "unknown", progress: null, errorMessage: null };
  }
  return { status: "queued", progress: null, errorMessage: null };
}

function isSettled(status: TrackRequestStatus) {
  return status === "completed" || status === "failed" || status === "unknown";
}

function hasOutstanding(snapshot: PollSnapshot | undefined) {
  const tracks = Object.values(registry.requested);
  if (tracks.length === 0) return false;
  return tracks.some(
    (track) =>
      !!registry.pending[track.id] ||
      !isSettled(derive(track, snapshot, false).status),
  );
}

// Adds the track to SoulSync's wishlist and starts a batch for it. The wishlist
// row is the durable intent; the batch is what acts on it.
export function useRequestTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (track: SoulSyncTrack) => requestTrack(track),
    networkMode: SOULSYNC_NETWORK_MODE,
    onMutate: (track) => setPending(track.id, true),
    onSuccess: (_data, track) => {
      setRequested({
        id: track.id,
        name: track.name,
        artist: track.artists?.[0] ?? "",
      });
      queryClient.invalidateQueries({ queryKey: soulSyncQueueKey });
      queryClient.invalidateQueries({ queryKey: requestsKey });
    },
    onSettled: (_data, _error, track) => setPending(track.id, false),
  });
}

// Owns the polling for every request the rows started; mount it once on the
// screen that renders them. Requests are dropped when that screen goes away.
export function useTrackRequestPoller() {
  const queryClient = useQueryClient();
  const isConnected = useSoulSync((store) => store.isConnected);
  const { requested } = useSyncExternalStore(subscribe, getRegistry);

  useEffect(() => {
    return () => {
      emit({ requested: {}, pending: {} });
      queryClient.removeQueries({ queryKey: requestsKey });
    };
  }, [queryClient]);

  useQuery<PollSnapshot>({
    queryKey: requestsKey,
    queryFn: async () => {
      const previous = queryClient.getQueryData<PollSnapshot>(requestsKey);
      // One failing list must not blank the other — a wishlist that answers
      // while /downloads is briefly unhappy still moves rows forward.
      const [wishlist, tasks] = await Promise.allSettled([
        fetchWishlist(),
        fetchDownloadTasks(),
      ]);
      if (wishlist.status === "rejected" && tasks.status === "rejected") {
        throw wishlist.reason;
      }
      const nextWishlist =
        wishlist.status === "fulfilled"
          ? wishlist.value
          : (previous?.wishlist ?? []);
      const nextTasks =
        tasks.status === "fulfilled" ? tasks.value : (previous?.tasks ?? []);

      const taskKeys = new Set(nextTasks.map(taskMatchKey));
      const wishIds = new Set(nextWishlist.map((row) => row.spotify_track_id));
      const unseen: Record<string, number> = {};
      const seen: Record<string, true> = { ...previous?.seen };
      for (const track of Object.values(registry.requested)) {
        const present =
          wishIds.has(track.id) || taskKeys.has(trackMatchKey(track));
        if (present) {
          seen[track.id] = true;
          unseen[track.id] = 0;
        } else {
          unseen[track.id] = (previous?.unseen[track.id] ?? 0) + 1;
        }
      }
      return { wishlist: nextWishlist, tasks: nextTasks, unseen, seen };
    },
    enabled: isConnected && Object.keys(requested).length > 0,
    retry: false,
    refetchInterval: (query) =>
      hasOutstanding(query.state.data) ? POLL_INTERVAL : false,
    networkMode: SOULSYNC_NETWORK_MODE,
    staleTime: 0,
  });
}

export interface TrackRequestView {
  status: TrackRequestStatus;
  progress: number | null;
  errorMessage: string | null;
  isRequested: boolean;
  isWorking: boolean;
}

// Reads one track's request out of the shared poll. `skipToken` subscribes the
// row to the cache without giving it a fetcher of its own.
export function useTrackRequest(trackId: string): TrackRequestView {
  const { requested, pending } = useSyncExternalStore(subscribe, getRegistry);
  const { data } = useQuery<PollSnapshot>({
    queryKey: requestsKey,
    queryFn: skipToken,
  });

  const track = requested[trackId];
  const isPending = !!pending[trackId];

  if (!track) {
    return {
      status: isPending ? "pending" : "idle",
      progress: null,
      errorMessage: null,
      isRequested: false,
      isWorking: isPending,
    };
  }

  const { status, progress, errorMessage } = derive(track, data, isPending);
  return {
    status,
    progress,
    errorMessage,
    isRequested: true,
    isWorking: !isSettled(status),
  };
}
