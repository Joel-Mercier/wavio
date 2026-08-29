import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import {
  albumSegments,
  type DestinationTrack,
} from "@/services/offline/fileNaming";
import { useAppBase } from "@/stores/app";
import { currentAuthScope } from "@/stores/auth";

// Where an offline download's bytes end up.
//
// By default that is the app's private `<document>/offline/<scope>/`, named by
// track id. A user can instead point downloads at a folder of their own via the
// Storage Access Framework, in which case we write a browsable
// `<scope>/<Artist>/<Album>/NN - Title.ext` tree that other music apps on the
// device can read. `OfflineTrack.path` stores the resulting absolute URI either
// way, so the two layouts coexist and switching the setting never orphans an
// existing file.
//
// Both layouts lead with the same `<scope>` segment, for the same reason: the
// offline store is persisted per (server, user), so without it the same album
// saved from two servers resolves to one document. The second download would
// overwrite the first, and removing the album on either server would delete
// bytes the other still lists as downloaded. The cost is one machine-named
// folder between the picked root and the artist folders — the tree below it
// stays exactly as browsable as before, and a single-server library is a single
// folder.
//
// Android only. iOS's directory picker grants access for the current app session
// only (expo-file-system takes no security-scoped bookmark), so a folder chosen
// there would stop working at the next launch; `externalRootUri()` always
// returns null off Android and every path below collapses to app storage.

export type DownloadLocationStatus = "app-storage" | "ok" | "unavailable";

const WRITE_PROBE_NAME = "wavio-write-test.tmp";

// SAF trees that Android grants but that are useless or off-limits to us: the
// Download/ root and the app-data sandboxes are refused outright on API 30+, and
// the picker can still hand back a URI for a tree we can't create in.
const RESTRICTED_TREE_PATTERNS = [
  /%3A(Android%2F)?(data|obb)(%2F|$)/i,
  /%3ADownload%2F?$/i,
];

export function externalRootUri(): string | null {
  if (Platform.OS !== "android") return null;
  return useAppBase.getState().downloadLocationUri ?? null;
}

export function isExternalDownloadLocation(): boolean {
  return externalRootUri() !== null;
}

export function isRestrictedTreeUri(uri: string): boolean {
  return RESTRICTED_TREE_PATTERNS.some((pattern) => pattern.test(uri));
}

// The app-private, per-scope directory. Files live under per-scope
// subdirectories so the same track id on two different servers doesn't
// overwrite a single shared file.
export function internalScopedDirectory(scope = currentAuthScope()): Directory {
  return new Directory(Paths.document, "offline", scope);
}

// Cached cover art, always app-private even when tracks are written to a folder
// the user picked — it's an internal cache keyed by the offline store, not part
// of the browsable tree other music apps read.
export function internalArtworkDirectory(
  scope = currentAuthScope(),
): Directory {
  return new Directory(internalScopedDirectory(scope), "artwork");
}

// The only DocumentsProvider whose document ids are real paths, and so the only
// one a folder name can be recovered from. Drive and friends hand back opaque
// ids, which would make `findOrCreateChild` miss every existing folder and let
// SAF uniquify a fresh `Artist (1)`, `Artist (2)`… on every single download — so
// a tree from any other provider is refused when it's picked.
const SUPPORTED_TREE_AUTHORITY = "com.android.externalstorage.documents";

export function isSupportedTreeUri(uri: string): boolean {
  return uri.startsWith(`content://${SUPPORTED_TREE_AUTHORITY}/`);
}

// `Directory.name` is `Paths.basename(uri)`, which for a SAF document URI is the
// basename of the decoded document id — right for ExternalStorageProvider (ids
// look like `primary:Music/Rock`), the only provider we accept a tree from.
// Decoded here explicitly rather than depending on URL parsing of a `content://`
// scheme.
function entryName(uri: string): string {
  let decoded = uri;
  try {
    decoded = decodeURIComponent(uri);
  } catch {}
  const trimmed = decoded.replace(/\/+$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  return lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
}

// Resolved `<root>/<Artist>` and `<root>/<Artist>/<Album>` URIs, keyed by
// `<rootUri>\n<segments>`. Each miss costs a full ContentResolver listing, and a
// whole-album download would otherwise pay for two per track. Cleared whenever
// the root changes so a re-picked folder can't be served a stale child URI.
const directoryCache = new Map<string, string>();
let cachedRoot: string | null = null;

// Per-path result of the SAF existence probe below, with the timestamp it was
// taken at.
const readabilityCache = new Map<string, { readable: boolean; at: number }>();
const READABILITY_TTL_MS = 5000;

function cacheKey(rootUri: string, segments: string[]): string {
  return `${rootUri}\n${segments.join("/")}`;
}

export function resetDownloadDestinationCache(): void {
  directoryCache.clear();
  cachedRoot = null;
  // A newly picked (or dropped) folder can turn every previously unreachable
  // download readable again, and waiting out the TTL for that would leave the
  // player streaming tracks it now has on disk.
  readabilityCache.clear();
}

function syncCacheRoot(rootUri: string): void {
  if (cachedRoot !== rootUri) {
    directoryCache.clear();
    cachedRoot = rootUri;
  }
}

// The path an external download is written to, below the picked root. The scope
// leads, so every folder created under someone's music directory belongs to a
// known (server, user) and the trees of two servers never merge.
function externalSegments(track: DestinationTrack, scope: string): string[] {
  return [scope, ...albumSegments(track)];
}

// Drops a track's `<Artist>` and `<Artist>/<Album>` entries. A cached URI is
// only ever wrong because the folder went away underneath us (deleted from
// another app, or an SD card remounted), which surfaces as a failed write — and
// without this the next attempt would be handed the same dead URI and fail
// identically until the app restarts.
export function forgetCachedDirectory(
  track: DestinationTrack,
  rootUri = externalRootUri(),
  scope = currentAuthScope(),
): void {
  if (!rootUri) return;
  const segments = externalSegments(track, scope);
  for (let depth = segments.length; depth > 0; depth--) {
    directoryCache.delete(cacheKey(rootUri, segments.slice(0, depth)));
  }
}

// SAF URIs cannot be path-joined — `new Directory(safDir, name)` appends to the
// URI and produces something no DocumentsProvider can resolve. Children are
// reached by listing the parent, and `createDirectory` is not idempotent
// (`DocumentFile.createDirectory` uniquifies), so it is find-then-create.
function findOrCreateChild(parent: Directory, name: string): Directory {
  const existing = parent
    .list()
    .find(
      (entry) => entry instanceof Directory && entryName(entry.uri) === name,
    );
  if (existing) return existing as Directory;
  return parent.createDirectory(name);
}

// Three downloads run concurrently, so two tracks from the same album can both
// miss the cache — and SAF uniquifies rather than merging, so a second create
// would leave "Album" and "Album (1)". What keeps that from happening is that
// the whole traversal below is synchronous: `list()` and `createDirectory()` are
// blocking calls, so nothing can interleave between finding a folder absent and
// creating it. Adding a real suspension point here would need the misses
// serialized behind a per-key promise.
async function resolveCachedDirectory(
  rootUri: string,
  segments: string[],
): Promise<Directory> {
  syncCacheRoot(rootUri);
  const key = cacheKey(rootUri, segments);

  const cached = directoryCache.get(key);
  if (cached) return new Directory(cached);

  let current = new Directory(rootUri);
  for (const segment of segments) {
    current = findOrCreateChild(current, segment);
  }
  directoryCache.set(key, current.uri);
  return current;
}

// The directory a download should be written into, creating it if needed.
// Returns the app-private scoped directory unless the user picked a folder.
//
// `rootUri` and `scope` are parameters so a download that already committed to a
// layout can pass what it read when it started: either can change while bytes are
// in flight — the setting is a toggle away, the scope a server switch away — and
// re-reading them here would file the track under whatever is current instead of
// where it belongs.
export async function resolveTargetDirectory(
  track: DestinationTrack,
  rootUri = externalRootUri(),
  scope = currentAuthScope(),
): Promise<Directory> {
  if (!rootUri) {
    const dir = internalScopedDirectory(scope);
    dir.create({ idempotent: true, intermediates: true });
    return dir;
  }
  return resolveCachedDirectory(rootUri, externalSegments(track, scope));
}

// Deletes `<scope>/<Artist>/<Album>`, then `<scope>/<Artist>`, then `<scope>`,
// for as long as removing a track left them empty — so cancelling a download or
// clearing the library doesn't leave a husk of folders behind in someone's music
// directory. Never touches the root the user picked, and never a sibling scope's
// folder.
//
// Walks down from the root rather than up from the file: `File.parentDirectory`
// is `Paths.join(uri, "..")`, pure string manipulation that produces a URI no
// DocumentsProvider can resolve once the path is a SAF document URI.
export async function pruneEmptyAlbumFolders(
  track: DestinationTrack,
  scope = currentAuthScope(),
): Promise<void> {
  const rootUri = externalRootUri();
  if (!rootUri) return;
  syncCacheRoot(rootUri);

  const segments = externalSegments(track, scope);
  for (let depth = segments.length; depth > 0; depth--) {
    const branch = segments.slice(0, depth);
    try {
      const dir = await findExistingDirectory(rootUri, branch);
      // Already gone — removed from another app, or never created because the
      // album folder is missing. The artist folder above it can still be an
      // empty husk, so keep walking out rather than giving up here.
      if (!dir?.exists) continue;
      // A non-empty album folder means its parent isn't empty either.
      if (dir.list().length > 0) return;
      dir.delete();
      directoryCache.delete(cacheKey(rootUri, branch));
    } catch {
      return;
    }
  }
}

// Resolves `<root>/<segments…>` without creating anything, so deletion paths
// can't conjure the folders they are meant to be removing.
async function findExistingDirectory(
  rootUri: string,
  segments: string[],
): Promise<Directory | null> {
  const key = cacheKey(rootUri, segments);
  const cached = directoryCache.get(key);
  if (cached) return new Directory(cached);

  let current = new Directory(rootUri);
  for (const segment of segments) {
    const child = current
      .list()
      .find(
        (entry) =>
          entry instanceof Directory && entryName(entry.uri) === segment,
      );
    if (!child) return null;
    current = child as Directory;
  }
  directoryCache.set(key, current.uri);
  return current;
}

// Whether the picked folder can still be written to. The grant is revocable from
// Android's settings and the volume can be unmounted, so this is checked at
// startup as well as right after picking.
export async function probeDownloadLocation(
  uri = externalRootUri(),
): Promise<DownloadLocationStatus> {
  if (!uri) return "app-storage";
  try {
    const root = new Directory(uri);
    if (!root.exists) return "unavailable";
    // Creating a real document *is* the write test: `exists` alone can't tell a
    // read-only tree from a writable one, and the picker still returns a URI for
    // trees API 30+ refuses to grant (Download/, Android/data).
    const probe = root.createFile(WRITE_PROBE_NAME, "application/octet-stream");
    if (probe.exists) probe.delete();
    return "ok";
  } catch {
    return "unavailable";
  }
}

// Whether a downloaded track's bytes count against the volume `Paths` measures.
//
// App storage always does. A `content://` path does only when its document id
// names the primary volume — ExternalStorageProvider ids are `<volume>:<relative
// path>`, `primary` for the device's own shared storage and a `XXXX-XXXX` serial
// for a removable card. Keyed off the path rather than the current setting: the
// setting only governs new downloads, so a library can straddle both.
export function downloadedFileIsOnPrimaryVolume(path: string): boolean {
  if (!path.startsWith("content://")) return true;
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {}
  return decoded.includes("/document/primary:");
}

// Whether a downloaded track's bytes can still be reached.
//
// App-private files are trusted without a syscall, as they always have been —
// nothing but this app can remove them. A `content://` path lives in a folder
// the user granted us, and that grant is revocable from Android's settings and
// dies when a volume unmounts, so it is verified. Keyed off the path rather than
// the current setting: turning the setting back off leaves already-downloaded
// SAF paths behind, and those still need checking.
//
// Synchronous by design — `resolveTrackUrl` calls this during a track change and
// cannot yield, which is also why the answer is memoized: `isPlayableNow` asks
// per track and the skip-to-playable scans in services/player.ts walk the whole
// queue, so an ejected SD card would otherwise cost one blocking ContentResolver
// query per queue entry on the JS thread before the scan gave up. The TTL is
// short enough that a remount or a re-granted folder is picked up on its own,
// and picking a different folder clears the memo outright.
//
// Deliberately does *not* drop the store entry on a miss (unlike
// the prefetch cache): a remounted SD card or a re-granted folder brings every
// one of these files back, and re-downloading a library because a card was
// ejected would be worse than a temporary fallback to streaming.
export function downloadedFileIsReadable(path: string | undefined): boolean {
  // Only ever answers false when a `content://` path is positively gone, so no
  // other record shape can be turned unplayable by this check.
  if (!path?.startsWith("content://")) return true;
  const now = Date.now();
  const cached = readabilityCache.get(path);
  if (cached && now - cached.at < READABILITY_TTL_MS) return cached.readable;
  let readable = false;
  try {
    readable = new File(path).exists;
  } catch {}
  readabilityCache.set(path, { readable, at: now });
  return readable;
}
