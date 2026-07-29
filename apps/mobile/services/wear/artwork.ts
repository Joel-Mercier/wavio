import { Directory, File, Paths } from "expo-file-system";

/**
 * Resolves a track's cover to a local file the native bridge can encode.
 *
 * The watch is not authenticated and has no route to the user's server, so
 * cover art has to travel to it as bytes. Downloading here rather than in
 * Kotlin is deliberate: `File.downloadFileAsync` goes through the app's own
 * networking stack, which already carries the server credentials embedded in
 * the artwork URL and the self-signed-certificate exemptions installed by
 * modules/ssl-trust. A raw connection opened natively would lose both.
 */

// Covers live in the cache directory: they are re-derivable, and letting the
// OS reclaim them under storage pressure is exactly the right behaviour.
const cacheDir = (): Directory => new Directory(Paths.cache, "wear-artwork");

// Only the current track's cover is ever displayed; a handful of entries is
// enough to make skipping back and forth free.
const MAX_CACHED = 8;

// Stable, short, filesystem-safe key for an arbitrary artwork URL. FNV-1a is
// plenty here — this only needs to avoid collisions within a few cached files,
// not resist anything.
const hashUrl = (url: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
};

const inFlight = new Map<string, Promise<string | null>>();

/**
 * Drop the oldest cached covers once the directory grows past MAX_CACHED.
 *
 * Oldest-first rather than wiping the directory: the cover handed to the native
 * bridge is still being decoded there, and deleting it mid-encode silently drops
 * the watch back to its placeholder. `keepUri` and any in-progress download
 * (`.part`) are never candidates.
 */
const pruneIfFull = (dir: Directory, keepUri: string) => {
  try {
    if (!dir.exists) return;
    const cached = dir
      .list()
      .filter(
        (entry): entry is File =>
          entry instanceof File && entry.uri !== keepUri,
      )
      .filter((file) => file.uri.endsWith(".img"));
    const excess = cached.length - (MAX_CACHED - 1);
    if (excess <= 0) return;
    cached
      .sort((a, b) => (a.modificationTime ?? 0) - (b.modificationTime ?? 0))
      .slice(0, excess)
      .forEach((file) => {
        try {
          file.delete();
        } catch {}
      });
  } catch {
    // Best effort; a stale cover costs nothing but disk.
  }
};

/**
 * Returns a `file://` URI for `url`, or null if it can't be resolved. Local
 * artwork (the on-device library writes covers under filesDir) passes straight
 * through — it is already a file the native side can read.
 */
export async function resolveArtworkFile(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("file://")) return url;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;

  const cached = inFlight.get(url);
  if (cached) return cached;

  const task = (async () => {
    let partial: File | null = null;
    try {
      const dir = cacheDir();
      dir.create({ idempotent: true, intermediates: true });

      const target = new File(dir, `${hashUrl(url)}.img`);
      if (target.exists) return target.uri;
      pruneIfFull(dir, target.uri);

      // Downloaded under a temporary name and only then moved into place. On
      // Android the response streams straight into the destination, so a
      // download cut short (backgrounded, connection dropped) leaves a truncated
      // file behind — one that `target.exists` above would happily serve
      // forever, since only a fresh download is ever size-checked.
      partial = new File(dir, `${hashUrl(url)}.part`);
      if (partial.exists) partial.delete();

      const result = await File.downloadFileAsync(url, partial, {
        idempotent: true,
      });
      if (!result.exists || result.size === 0) {
        try {
          result.delete();
        } catch {}
        return null;
      }
      await result.move(target);
      partial = null;
      return target.uri;
    } catch (error) {
      try {
        if (partial?.exists) partial.delete();
      } catch {}
      // A missing cover is an ordinary outcome (untagged local files, a server
      // that 404s on getCoverArt); the watch renders a placeholder and nothing
      // else is affected, so this is not worth reporting.
      if (__DEV__) console.log("[wear] artwork download failed", error);
      return null;
    }
  })();

  inFlight.set(url, task);
  const forget = () => {
    inFlight.delete(url);
  };
  void task.then(forget, forget);
  return task;
}

/** Wipe cached covers — used when the server/user scope changes. */
export function clearArtworkCache(): void {
  inFlight.clear();
  try {
    const dir = cacheDir();
    if (dir.exists) dir.delete();
  } catch {}
}
