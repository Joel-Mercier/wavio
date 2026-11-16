import { getIsEffectivelyOnline } from "@/services/network";
import { currentAuthScope } from "@/stores/auth";
import type { QueueSource, QueueTrack } from "@/stores/queue";
import { encodeMediaId, parseMediaId } from "./mediaId";
import { t } from "./nodes";
import { listChildren } from "./providers";
import type { Listing } from "./providers/shared";
import type { BrowseNode } from "./types";

export type { Listing };

const TTL_MS = 5 * 60 * 1000;

type Entry = Listing & { at: number };

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<Listing | null>>();
let cacheScope: string | null = null;
let generation = 0;

const scopedCache = () => {
  const scope = currentAuthScope();
  if (scope !== cacheScope) {
    cache.clear();
    inFlight.clear();
    cacheScope = scope;
    generation++;
  }
  return cache;
};

const offlineNotice = (): Listing => ({
  nodes: [
    {
      id: encodeMediaId({ kind: "section", key: "downloads" }),
      title: t("offlineNotice"),
      subtitle: t("offlineNoticeSubtitle"),
      playable: false,
      browsable: true,
      icon: "downloads",
      childrenStyle: "list",
      itemStyle: "list",
    },
  ],
});

const isCurrent = (startedIn: number) => {
  scopedCache();
  return startedIn === generation;
};

async function load(
  parentId: string,
  startedIn: number,
): Promise<Listing | null> {
  const id = parseMediaId(parentId);
  if (!id) return null;
  const listing = await listChildren(id).catch(() => null);
  if (listing && isCurrent(startedIn)) {
    cache.set(parentId, { ...listing, at: Date.now() });
  }
  return listing;
}

export function getListing(
  parentId: string,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<Listing | null> {
  const entries = scopedCache();
  const cached = entries.get(parentId);
  if (cached && !fresh && Date.now() - cached.at < TTL_MS) {
    return Promise.resolve(cached);
  }
  const pending = inFlight.get(parentId);
  if (pending) return pending;
  const startedIn = generation;
  const request = load(parentId, startedIn)
    .then((listing) => {
      if (!isCurrent(startedIn)) return null;
      if (listing) return listing;
      if (cached) return cached;
      return getIsEffectivelyOnline() ? null : offlineNotice();
    })
    .finally(() => {
      if (inFlight.get(parentId) === request) inFlight.delete(parentId);
    });
  inFlight.set(parentId, request);
  return request;
}

export async function getChildren(
  parentId: string,
  options?: { fresh?: boolean },
): Promise<BrowseNode[] | null> {
  return (await getListing(parentId, options))?.nodes ?? null;
}

export async function getTracks(parentId: string): Promise<{
  tracks: QueueTrack[];
  source?: QueueSource;
} | null> {
  const listing = await getListing(parentId);
  if (!listing?.tracks || listing.tracks.length === 0) return null;
  return { tracks: listing.tracks, source: listing.source };
}

export function putListing(parentId: string, listing: Listing) {
  scopedCache().set(parentId, { ...listing, at: Date.now() });
}

export function cachedListing(parentId: string): Listing | undefined {
  return scopedCache().get(parentId);
}

export function invalidateListings(matches: (parentId: string) => boolean) {
  for (const key of [...scopedCache().keys()]) {
    if (matches(key)) cache.delete(key);
  }
}

export function clearListings() {
  cache.clear();
  inFlight.clear();
  generation++;
}

export function patchNodes(
  matches: (node: BrowseNode) => boolean,
  patch: (node: BrowseNode) => BrowseNode,
): string[] {
  const changed: string[] = [];
  for (const [parentId, entry] of scopedCache()) {
    if (!entry.nodes.some(matches)) continue;
    entry.nodes = entry.nodes.map((node) =>
      matches(node) ? patch(node) : node,
    );
    changed.push(parentId);
  }
  return changed;
}
