// The canonical address of an iOS on-device root, and its mapping to wherever
// the root currently is. Pure and dependency-free: the device file source runs
// this on every listing, and its tests exercise it directly. The stateful half
// — which roots exist, re-opening them at launch, the folder picker — lives in
// ./localFolders.ts and feeds the map below.
//
// Android hands the library SAF tree URIs that stay valid for as long as the
// grant does, so `Server.paths`, `tracks.uri` and every id derived from it can
// carry them verbatim. iOS has nothing of the sort: the app container's path
// changes with every update (`…/Application/<UUID>/…`), and a folder picked from
// the Files app is only reachable through a bookmark that resolves to whatever
// path its provider mounts it at today. Encoding either path into a track id
// would reindex the library — and orphan every favourite, playlist entry and
// play count — on each update.
//
// So iOS roots are addressed as `local-folder://<rootId>/<relative path>`, the
// same shape the network shares use (`smb:/Music/a.flac`): the DB and the ids
// hold the stable form, and the device file source swaps in the currently
// resolved `file://` root at the seam.

export const LOCAL_FOLDER_SCHEME = "local-folder://";
export const MUSIC_ROOT_ID = "music";

export const localFolderRoot = (rootId: string): string =>
  `${LOCAL_FOLDER_SCHEME}${rootId}`;

export const musicRoot = (): string => localFolderRoot(MUSIC_ROOT_ID);

export const isLocalFolderUri = (uri: string): boolean =>
  uri.startsWith(LOCAL_FOLDER_SCHEME);

export function parseLocalFolderUri(
  uri: string,
): { rootId: string; relative: string } | null {
  if (!isLocalFolderUri(uri)) return null;
  const rest = uri.slice(LOCAL_FOLDER_SCHEME.length);
  const slash = rest.indexOf("/");
  return slash < 0
    ? { rootId: rest, relative: "" }
    : { rootId: rest.slice(0, slash), relative: rest.slice(slash + 1) };
}

// rootId → the `file://` URI it currently resolves to, without a trailing
// slash. A root that is configured but absent here is one whose folder is gone.
const resolved = new Map<string, string>();

const stripTrailingSlash = (uri: string): string => uri.replace(/\/+$/, "");

export function setResolvedRoot(rootId: string, fileUri: string): void {
  resolved.set(rootId, stripTrailingSlash(fileUri));
}

export const hasResolvedRoot = (rootId: string): boolean =>
  resolved.has(rootId);

/** The root already resolved to `fileUri`, if any. */
export function resolvedRootIdFor(fileUri: string): string | null {
  const trimmed = stripTrailingSlash(fileUri);
  for (const [rootId, root] of resolved) {
    if (root === trimmed) return rootId;
  }
  return null;
}

/**
 * Canonical → `file://`. Null when the root isn't resolved, which the device
 * source turns into the same classified error a revoked SAF grant produces.
 */
export function toFileUri(canonical: string): string | null {
  const parsed = parseLocalFolderUri(canonical);
  if (!parsed) return null;
  const root = resolved.get(parsed.rootId);
  if (!root) return null;
  return parsed.relative ? `${root}/${parsed.relative}` : root;
}

/**
 * `file://` → canonical, for an entry expo-file-system listed under a root.
 * The relative part is the resolved root sliced off the entry's own URI: both
 * come from expo-file-system, so the encoding is consistent and reversible.
 */
export function toCanonical(rootId: string, fileUri: string): string | null {
  const root = resolved.get(rootId);
  if (!root) return null;
  const trimmed = stripTrailingSlash(fileUri);
  if (trimmed === root) return localFolderRoot(rootId);
  if (!trimmed.startsWith(`${root}/`)) return null;
  return `${localFolderRoot(rootId)}/${trimmed.slice(root.length + 1)}`;
}

// The restore pass that fills the map is owned by ./localFolders.ts, which
// registers it here so the device source can wait for it without importing the
// stores and native module it needs. Nothing registered (Android, tests) means
// nothing to wait for.
let restorer: (() => Promise<void>) | null = null;

export function registerRootsRestorer(restore: () => Promise<void>): void {
  restorer = restore;
}

export function ensureRootsResolved(): Promise<void> {
  return restorer ? restorer() : Promise.resolve();
}

/** Test seam. */
export function __resetLocalFolderUris(): void {
  resolved.clear();
  restorer = null;
}
