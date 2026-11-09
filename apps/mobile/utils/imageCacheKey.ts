// expo-image keys its disk cache on the full URL by default. A Subsonic image
// URL carries the session's credentials (`u` plus `t`/`s` or `p`) and the
// client's `v`/`c`, none of which change the image, so every re-auth and route
// swap used to orphan the whole cache.
const SUBSONIC_SESSION_PARAMS = new Set(["u", "t", "s", "p", "v", "c"]);

// Navidrome ids carry an updated-at token (`al-<id>_68e67692`), so a replaced
// cover is already a new URL. Artists always carry `_0`, and other servers
// (gonic, Airsonic, LMS…) no token at all: for those the per-sign-in salt `s`
// stays in the key, which is what used to make a re-auth pick up a changed
// cover and still does. expo-image has no expiry of its own to fall back on.
const VERSIONED_COVER_ID = /^(?:al|ar|mf|pl)-[^_]+_(?!0$).+$/;

/** The signed-in session an image key is scoped to: one (server, user). */
export type ImageCacheSession = { scope: string; bases: string[] };

export function imageCacheSession(
  scope: string,
  urls: readonly (string | undefined)[],
): ImageCacheSession {
  const bases = new Set<string>();
  for (const url of urls) {
    const base = url?.trim().replace(/\/+$/, "");
    if (base && /^https?:\/\//i.test(base)) bases.add(base);
  }
  return {
    scope,
    bases: [...bases].sort((a, b) => b.length - a.length),
  };
}

function coverId(params: string[]): string {
  const raw = params.find((param) => param.startsWith("id="))?.slice(3) ?? "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function imageCacheKey(
  uri: string,
  session: ImageCacheSession | null,
): string | undefined {
  const base = session?.bases.find(
    (candidate) =>
      uri.startsWith(candidate) &&
      /^(?:[/?#]|$)/.test(uri.slice(candidate.length)),
  );
  if (!session || !base) return undefined;
  const rest = uri.slice(base.length).split("#")[0];
  const queryAt = rest.indexOf("?");
  const path = queryAt === -1 ? rest : rest.slice(0, queryAt);
  const all =
    queryAt === -1
      ? []
      : rest
          .slice(queryAt + 1)
          .split("&")
          .filter(Boolean);
  let params = all;
  if (path.startsWith("/rest/")) {
    const keepSalt = !VERSIONED_COVER_ID.test(coverId(all));
    params = all.filter((param) => {
      const name = param.split("=")[0];
      if (keepSalt && name === "s") return true;
      return !SUBSONIC_SESSION_PARAMS.has(name);
    });
  }
  const query = params.sort().join("&");
  return `${session.scope}${path}${query ? `?${query}` : ""}`;
}
