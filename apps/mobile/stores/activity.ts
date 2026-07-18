import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import { currentAuthScope } from "@/stores/auth";
import type { QueueSource, QueueTrack } from "@/stores/queue";
import createSelectors from "@/utils/createSelectors";

export type ActivitySourceType = "album" | "artist" | "playlist";

export type ActivitySource = {
  type: ActivitySourceType;
  id: string;
  name: string;
  // The source's own art (artist image / album / playlist cover), not the
  // played track's album art.
  coverArt?: string;
} | null;

// A track play snapshot plus the source it was played from. Grouped by source
// into collapsible sessions on the Activity screen.
export type ActivityEntry = {
  trackId: string;
  title: string;
  artist?: string;
  album?: string;
  coverArt?: string;
  albumId?: string;
  artistId?: string;
  // null when the play has no clear album/artist/playlist source → generic group.
  source: ActivitySource;
  playedAt: number;
};

const MAX_ENTRIES = 200;

// Only album/artist/playlist sources (with an id to route to) are grouped;
// everything else (liked songs, folders, similar, most played, …) falls back to
// a generic group.
const toActivitySource = (source: QueueSource): ActivitySource => {
  if (!source?.id) return null;
  if (
    source.type === "album" ||
    source.type === "artist" ||
    source.type === "playlist"
  ) {
    return {
      type: source.type,
      id: source.id,
      name: source.name,
      coverArt: source.coverArt,
    };
  }
  return null;
};

const sourceKey = (source: ActivitySource) =>
  source ? `${source.type}:${source.id}` : "__generic__";

interface ActivityStore {
  activity: ActivityEntry[];
  recordPlay: (track: QueueTrack, source: QueueSource) => void;
  clearActivity: () => void;
  __reset: () => void;
}

const useActivityBase = create<ActivityStore>()(
  persist(
    (set) => ({
      activity: [],
      recordPlay: (track, source) => {
        set((state) => {
          const activitySource = toActivitySource(source);
          const key = sourceKey(activitySource);
          const head = state.activity[0];
          // A looped/repeated track under the same source only refreshes the
          // timestamp so it doesn't inflate the session's count.
          if (
            head &&
            head.trackId === track.id &&
            sourceKey(head.source) === key
          ) {
            const [, ...rest] = state.activity;
            return {
              activity: [{ ...head, playedAt: Date.now() }, ...rest],
            };
          }
          const entry: ActivityEntry = {
            trackId: track.id,
            title: track.title ?? "",
            artist: track.artist,
            album: track.album,
            coverArt: track.coverArt,
            albumId: track.albumId,
            artistId: track.artistId,
            source: activitySource,
            playedAt: Date.now(),
          };
          const next = [entry, ...state.activity];
          if (next.length > MAX_ENTRIES) {
            next.length = MAX_ENTRIES;
          }
          return { activity: next };
        });
      },
      clearActivity: () => {
        set({ activity: [] });
      },
      __reset: () => {
        set({ activity: [] });
      },
    }),
    {
      name: "activity",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
      // v0 stored opened-resource entries with an incompatible shape; discard them.
      version: 1,
      migrate: () => ({ activity: [] }),
    },
  ),
);

const useActivity = createSelectors(useActivityBase);

export default useActivity;
