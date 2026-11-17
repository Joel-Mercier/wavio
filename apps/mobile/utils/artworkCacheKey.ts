// Navidrome cover ids embed the entity's updated-at token
// (`al-<id>_<unix>`, and the same for `ar-` / `mf-` / `pl-`), so the *same*
// image is requested under a different id every time the entity changes —
// constantly for smart playlists, which re-evaluate on every read. Keying the
// offline artwork cache on the entity part alone keeps a cached cover
// resolvable after the token moves; genuine cover replacements are still
// picked up by the artwork refresh window (isArtworkStale). Ids that don't
// carry a token are used verbatim.
//
// Kept dependency-free (rather than living in utils/artwork.ts, which reaches
// into the auth/offline stores) so the pure sync-plan helpers can use it.
// The token's encoding varies (`ar-<id>_0` but `al-<id>_68e67692`, a hex unix
// time), so match on position rather than shape: the entity id itself never
// contains an underscore, so everything from the first one on is the token.
const NAVIDROME_ARTWORK_ID = /^((?:al|ar|mf|pl)-[^_]+)_.+$/;

export const artworkCacheKey = (id: string): string =>
  id.replace(NAVIDROME_ARTWORK_ID, "$1");

const unsafeFileChars = /[^a-zA-Z0-9._-]/g;

export const artworkCacheFileStem = (key: string): string =>
  key.replace(unsafeFileChars, "_");

// Timestamped, so a refreshed cover gets a new file:// URI: expo-image keys
// its cache on the URI and would keep showing the old bytes.
export const artworkCacheFileName = (key: string, savedAt: number): string =>
  `${artworkCacheFileStem(key)}_${savedAt}.jpg`;

const ARTWORK_CACHE_FILE = /^file:\/\/.*\/artwork\/([^/]+)_\d+\.jpg$/;

export const artworkCacheFileStemOf = (uri: string): string | undefined =>
  uri.match(ARTWORK_CACHE_FILE)?.[1];
