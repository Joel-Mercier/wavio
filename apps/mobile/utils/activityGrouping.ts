import { isThisWeek } from "date-fns/isThisWeek";
import { isToday } from "date-fns/isToday";
import { isYesterday } from "date-fns/isYesterday";
import type { ActivityEntry, ActivitySource } from "@/stores/activity";

export type ActivitySectionKey = "today" | "yesterday" | "thisWeek" | "older";

export type ActivityGroup = {
  key: string;
  source: ActivitySource;
  entries: ActivityEntry[];
};

export type ActivitySection = {
  key: ActivitySectionKey;
  groups: ActivityGroup[];
};

const SECTION_ORDER: ActivitySectionKey[] = [
  "today",
  "yesterday",
  "thisWeek",
  "older",
];

const sourceKey = (source: ActivitySource) =>
  source ? `${source.type}:${source.id}` : "__generic__";

const bucketFor = (playedAt: number): ActivitySectionKey => {
  const date = new Date(playedAt);
  if (isToday(date)) return "today";
  if (isYesterday(date)) return "yesterday";
  if (isThisWeek(date, { weekStartsOn: 1 })) return "thisWeek";
  return "older";
};

// Groups a day bucket's entries (kept in recency-desc order) into runs of
// consecutive plays sharing the same source; consecutive sourceless plays merge
// into one generic group. Each group dedupes by trackId, keeping the most recent.
const buildGroups = (
  sectionKey: ActivitySectionKey,
  entries: ActivityEntry[],
): ActivityGroup[] => {
  const groups: ActivityGroup[] = [];
  let current: ActivityEntry[] = [];
  let currentKey: string | null = null;
  let runIndex = 0;

  const flush = () => {
    if (current.length === 0) return;
    const seen = new Set<string>();
    const deduped: ActivityEntry[] = [];
    for (const entry of current) {
      if (seen.has(entry.trackId)) continue;
      seen.add(entry.trackId);
      deduped.push(entry);
    }
    groups.push({
      key: `${sectionKey}:${runIndex}:${currentKey}`,
      source: deduped[0].source,
      entries: deduped,
    });
    runIndex += 1;
    current = [];
  };

  for (const entry of entries) {
    const key = sourceKey(entry.source);
    if (key !== currentKey) {
      flush();
      currentKey = key;
    }
    current.push(entry);
  }
  flush();
  return groups;
};

export const groupActivity = (entries: ActivityEntry[]): ActivitySection[] => {
  const buckets: Record<ActivitySectionKey, ActivityEntry[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: [],
  };
  for (const entry of entries) {
    buckets[bucketFor(entry.playedAt)].push(entry);
  }
  return SECTION_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    groups: buildGroups(key, buckets[key]),
  }));
};
