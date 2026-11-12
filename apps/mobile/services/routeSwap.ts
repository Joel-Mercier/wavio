import { hasNetworkServerType } from "@/services/backend/serverTraits";
import { useAuthBase } from "@/stores/auth";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { useServersBase } from "@/stores/servers";
import { normalizeServerUrl } from "@/utils/serverUrl";

// Repoint queue entries at whichever of a server's routes is active.
//
// Most URLs in the app are rebuilt per call and follow the active route for
// free. The persisted queue is the exception: utils/childToTrack.ts bakes
// absolute `url` and `artwork` strings into every entry, and `artwork` is read
// back verbatim by the queue rows, the floating player, the lock screen and the
// widget. Left alone, those keep pointing at the route we just failed away from.
// Entries baked from a server URL saved with a trailing slash carry `//rest/`
// (issue #277), so the active route is rewritten too, to collapse that.

/**
 * The active route plus the other routes the same server is known by.
 *
 * Matching is on the server's full configured URL, not just its origin, so a
 * server hosted under a base path (https://example.com/music) is handled. Longer
 * prefixes are tried first: if one route is a prefix of the other, only the
 * longer match is the correct reading.
 */
function routeRewrites(): { active: string; known: string[] } | null {
  const { serverId, url, serverType } = useAuthBase.getState();
  if (!url || !hasNetworkServerType(serverType)) return null;
  const server = useServersBase.getState().getServerById(serverId);
  if (!server) return null;
  const active = normalizeServerUrl(url);
  const known = [
    ...new Set(
      [active, server.url, server.fallbackUrl]
        .filter((u): u is string => !!u)
        .map(normalizeServerUrl),
    ),
  ].sort((a, b) => b.length - a.length);
  return { active, known };
}

/**
 * Whether a baked absolute URL points at the active server, on any of its known
 * routes — i.e. whether reaching it depends on the server being up, as opposed
 * to an offline `file://` path, an internet-radio stream or a third-party
 * podcast enclosure, which are all hosted elsewhere.
 */
export function isActiveServerUrl(url: string | undefined): boolean {
  if (!url) return false;
  const { serverId, url: activeUrl } = useAuthBase.getState();
  if (!activeUrl) return false;
  const server = useServersBase.getState().getServerById(serverId);
  return [activeUrl, server?.url, server?.fallbackUrl]
    .filter((u): u is string => !!u)
    .map(normalizeServerUrl)
    .some((prefix) => url.startsWith(prefix));
}

function repoint(value: string, active: string, known: string[]): string {
  for (const prefix of known) {
    if (value.startsWith(prefix)) {
      return active + value.slice(prefix.length).replace(/^\/{2,}/, "/");
    }
  }
  return value;
}

/**
 * Rewrite every queue entry whose baked URLs belong to a known route of the
 * active server.
 *
 * The "starts with a known route" test is what keeps this safe: offline
 * `file://` paths, internet-radio streams and podcast enclosures are all
 * absolute URLs on other hosts, so they never match and are never touched.
 *
 * Idempotent, and a no-op unless something actually changes — safe to call on
 * every swap and after every rehydration.
 */
export function rewriteQueueRoutes(): void {
  const routes = routeRewrites();
  if (!routes) return;
  const { active, known } = routes;
  let changed = false;
  const next = useQueue.getState().queue.map((track: QueueTrack) => {
    const url = track.url ? repoint(track.url, active, known) : track.url;
    const artwork = track.artwork
      ? repoint(track.artwork, active, known)
      : track.artwork;
    if (url === track.url && artwork === track.artwork) return track;
    changed = true;
    return { ...track, url, artwork };
  });
  if (changed) useQueue.setState({ queue: next });
}
