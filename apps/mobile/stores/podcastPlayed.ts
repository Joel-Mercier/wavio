import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "@/config/storage";
import type { PodcastSource } from "@/stores/podcasts";
import createSelectors from "@/utils/createSelectors";

const TADDY_BUCKET = "taddy";
// Oldest marks are dropped past this, per bucket.
const MAX_PLAYED_PER_BUCKET = 5000;

// Kept out of stores/podcasts.ts: that store is re-persisted on every throttled
// progress write, and this map only grows, so it must not be re-serialized on
// each tick.
//
// Bucketed like podcastProgressForScope: server episode ids (Subsonic and
// on-device RSS alike) belong to the auth scope they were listed under, Taddy
// uuids are server-independent.
export function podcastPlayedBucket(
  source: PodcastSource,
  scope: string | undefined,
): string | undefined {
  return source === "taddy" ? TADDY_BUCKET : scope;
}

// cyrb53. Marks are only ever tested for membership, and a local RSS id is its
// enclosure URL in hex (often 300+ characters), so storing a 53-bit hash keeps
// a full bucket around 150 KB instead of megabytes rewritten on every mark.
export function podcastPlayedKey(id: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < id.length; i++) {
    const ch = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function capBucket(ids: Record<string, number>): Record<string, number> {
  const keys = Object.keys(ids);
  if (keys.length <= MAX_PLAYED_PER_BUCKET) return ids;
  keys.sort((a, b) => ids[a] - ids[b]);
  for (const key of keys.slice(0, keys.length - MAX_PLAYED_PER_BUCKET)) {
    delete ids[key];
  }
  return ids;
}

interface PodcastPlayedStore {
  // bucket → podcastPlayedKey(episode id) → when it was marked played (ms).
  played: Record<string, Record<string, number>>;
  isPlayed: (bucket: string, id: string) => boolean;
  markPlayed: (bucket: string, id: string) => void;
  markAllPlayed: (bucket: string, ids: string[]) => void;
  markUnplayed: (bucket: string, id: string) => void;
  markAllUnplayed: (bucket: string, ids: string[]) => void;
  forgetBuckets: (matches: (bucket: string) => boolean) => void;
  clearAll: () => void;
}

export const usePodcastPlayedBase = create<PodcastPlayedStore>()(
  persist(
    (set, get) => ({
      played: {},
      isPlayed: (bucket, id) =>
        get().played[bucket]?.[podcastPlayedKey(id)] !== undefined,
      // The end guard re-fires on every status tick in an episode's tail.
      markPlayed: (bucket, id) => {
        if (get().isPlayed(bucket, id)) return;
        set((state) => ({
          played: {
            ...state.played,
            [bucket]: capBucket({
              ...state.played[bucket],
              [podcastPlayedKey(id)]: Date.now(),
            }),
          },
        }));
      },
      // One write for a whole channel. Episodes already played keep their
      // original date, so the cap still drops the oldest listens first.
      markAllPlayed: (bucket, ids) => {
        const now = Date.now();
        const current = get().played[bucket] ?? {};
        const added = ids
          .map(podcastPlayedKey)
          .filter((key) => current[key] === undefined);
        if (added.length === 0) return;
        set((state) => {
          const next = { ...state.played[bucket] };
          for (const key of added) next[key] = now;
          return { played: { ...state.played, [bucket]: capBucket(next) } };
        });
      },
      // Called on every progress write, so an unplayed episode must not
      // trigger a set (and with it a persist write) at all.
      markUnplayed: (bucket, id) => {
        if (!get().isPlayed(bucket, id)) return;
        set((state) => {
          const ids = { ...state.played[bucket] };
          delete ids[podcastPlayedKey(id)];
          return { played: { ...state.played, [bucket]: ids } };
        });
      },
      markAllUnplayed: (bucket, ids) => {
        const current = get().played[bucket] ?? {};
        const removed = ids
          .map(podcastPlayedKey)
          .filter((key) => current[key] !== undefined);
        if (removed.length === 0) return;
        set((state) => {
          const next = { ...state.played[bucket] };
          for (const key of removed) delete next[key];
          return { played: { ...state.played, [bucket]: next } };
        });
      },
      forgetBuckets: (matches) => {
        const buckets = Object.keys(get().played);
        if (!buckets.some(matches)) return;
        set((state) => ({
          played: Object.fromEntries(
            Object.entries(state.played).filter(([bucket]) => !matches(bucket)),
          ),
        }));
      },
      clearAll: () => {
        set({ played: {} });
      },
    }),
    {
      name: "podcastPlayed",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

const usePodcastPlayedStore = createSelectors(usePodcastPlayedBase);

export default usePodcastPlayedStore;
