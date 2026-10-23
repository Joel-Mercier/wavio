import { useEffect, useState } from "react";
import { hostnameFromUrl } from "@/modules/ssl-trust";
import { discoverProtectedResource } from "@/services/oidc/discovery";

// Long enough that typing a URL doesn't fire a lookup per keystroke.
const DISCOVERY_DEBOUNCE_MS = 700;
// A host with a dot or a port — skips lookups for the half-typed "https://mus".
const LOOKS_COMPLETE = /^https?:\/\/[^/\s]+[.:][^/\s]/i;

/**
 * The host of the identity provider `url`'s proxy publishes (RFC 9728), or
 * null when it publishes none — the common case, a server not behind single
 * sign-on. Undefined while the lookup for the current URL hasn't answered.
 */
export function useSsoDiscovery(
  url: string,
  headers: Record<string, string> | undefined,
): string | null | undefined {
  const [found, setFound] = useState<{
    url: string;
    host: string | null;
  } | null>(null);
  const trimmed = url.trim();
  const headersKey = JSON.stringify(headers ?? {});

  // biome-ignore lint/correctness/useExhaustiveDependencies: headersKey stands in for headers
  useEffect(() => {
    if (!LOOKS_COMPLETE.test(trimmed)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      discoverProtectedResource(trimmed, headers)
        .catch(() => null)
        .then((resource) => {
          if (cancelled) return;
          setFound({
            url: trimmed,
            host: resource
              ? hostnameFromUrl(resource.authorizationServers[0]) || null
              : null,
          });
        });
    }, DISCOVERY_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, headersKey]);

  if (!LOOKS_COMPLETE.test(trimmed)) return null;
  return found?.url === trimmed ? found.host : undefined;
}
