import {
  artworkCacheFileStem,
  artworkCacheFileStemOf,
  artworkCacheKey,
} from "@/utils/artworkCacheKey";

export function sourceUri(source: unknown): string | undefined {
  if (typeof source === "string") return source || undefined;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return undefined;
  }
  const { uri } = source as { uri?: unknown };
  return typeof uri === "string" && uri ? uri : undefined;
}

const SIZE_PARAMS = new Set([
  "size",
  "width",
  "height",
  "maxWidth",
  "maxHeight",
  "fillWidth",
  "fillHeight",
  "quality",
]);

const JELLYFIN_ITEM_IMAGE = /\/Items\/([^/?#]+)\/Images\//;

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const coverKey = (id: string) =>
  `cover:${artworkCacheFileStem(artworkCacheKey(id))}`;

// Names the cover rather than the request for it, so it only changes when a
// view really moves to another image. A thumbnail size, the session's auth
// params, Navidrome's updated-at token or the switch to the offline cache's
// copy of the same cover all leave it unchanged.
export function imageRecyclingKey(source: unknown): string | undefined {
  const uri = sourceUri(source);
  if (!uri) return undefined;
  const cachedStem = artworkCacheFileStemOf(uri);
  if (cachedStem) return `cover:${cachedStem}`;
  if (!/^https?:/i.test(uri)) return uri;

  const [withoutHash] = uri.split("#");
  const queryAt = withoutHash.indexOf("?");
  const path = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  const params =
    queryAt === -1
      ? []
      : withoutHash
          .slice(queryAt + 1)
          .split("&")
          .filter(Boolean);

  if (path.includes("/rest/")) {
    const id = params.find((param) => param.startsWith("id="));
    if (id) return coverKey(decode(id.slice(3)));
  }
  const jellyfinItem = path.match(JELLYFIN_ITEM_IMAGE)?.[1];
  if (jellyfinItem) return coverKey(decode(jellyfinItem));

  const kept = params.filter((param) => !SIZE_PARAMS.has(param.split("=")[0]));
  return kept.length > 0 ? `${path}?${kept.join("&")}` : path;
}
