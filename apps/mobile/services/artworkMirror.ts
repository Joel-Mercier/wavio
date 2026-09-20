import { Directory, File, Paths } from "expo-file-system";
import { hostnameFromUrl } from "@/modules/ssl-trust";
import { requestHeadersForUrl } from "@/services/serverHeaders";
import { artworkCacheKey } from "@/utils/artworkCacheKey";
import { looksLikeImage } from "@/utils/imageBytes";

// Local mirror of remote cover art, so a consumer that can't speak to our server
// never has to fetch it itself.
//
// Two such consumers exist, and both fail the same way:
//   - the OS media controls (expo-audio loads `artworkUrl` natively: a bare
//     `url.openConnection().getInputStream()` on Android, a bare
//     `URLSession.shared.dataTask` on iOS),
//   - the Android Auto host, which renders browse items in its own process and
//     fetches any `http(s)` icon URI itself.
// Neither carries the server's custom headers, its client certificate, or the
// trust decision for a self-signed certificate; the car host additionally
// answers to its own network policy and its own image budget, so a screenful of
// full-size tiles can fail where one cover succeeds. All of them swallow the
// failure, so artwork silently doesn't appear — issue #156 was reported against
// a plain-http server, which rules the certificate case out as *the* explanation
// while leaving the mechanism intact. Handing these consumers a local file (or,
// for the car, a `content://` URI backed by one) sidesteps the foreign fetch
// entirely, whatever its reason for failing.
//
// Callers get an instance via `createArtworkMirror`; each instance owns its own
// directory and entry cap, because the sizes they request differ (the lock
// screen wants the full cover, the car a downscaled one) and `coverIdentity`
// below deliberately ignores the size parameter — one shared directory would let
// them overwrite each other's file.

const MIN_COVER_BYTES = 512;
// Matches the shared axios instance's timeout (services/openSubsonic/index.ts).
const REQUEST_TIMEOUT_MS = 15_000;
// Backstop for servers whose cover URL doesn't change when the artwork does.
// Navidrome embeds a content hash in the id (`mf-<id>_6a6bc4c1`), so there a
// changed cover is already a different URL and a different cache entry.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isRemote(url: string | undefined): url is string {
  return !!url && /^https?:/i.test(url);
}

// What identifies a cover, independent of how this session happens to be
// requesting it. A Subsonic cover URL carries per-session auth params (`u`/`t`/
// `s`), so hashing the raw URL would miss the whole cache after every login;
// Navidrome further suffixes an updated-at token that moves whenever the entity
// is touched, which `artworkCacheKey` strips — the same normalization the
// offline artwork cache uses, and the reason MAX_AGE_MS exists as the backstop
// for a cover that really was replaced. Jellyfin puts the id in the path, so
// dropping the query is enough there.
function coverIdentity(url: string): string {
  // Host-scoped: cover ids are only unique within a server, and this app is
  // built around holding several. Two servers sharing an id (or Jellyfin's
  // identical `/Items/<id>/Images/Primary` path shape) must not share a file.
  const host = hostnameFromUrl(url) || "unknown";
  const id = url.match(/[?&]id=([^&]+)/)?.[1];
  if (id) {
    let decoded = id;
    try {
      decoded = decodeURIComponent(id);
    } catch {
      // A malformed escape sequence — hash the raw value instead.
    }
    return `${host}/${artworkCacheKey(decoded)}`;
  }
  return `${host}/${url.split("?")[0]}`;
}

// FNV-1a twice with different primes, giving 64 bits of filename. Deterministic
// and synchronous — the cache-hit path has to answer during a track change, so
// an async digest (expo-crypto) would force the first notification of every
// track to go out without artwork.
function cacheKey(url: string): string {
  const basis = coverIdentity(url);
  let a = 0x811c9dc5;
  let b = 0xc59d1c81;
  for (let i = 0; i < basis.length; i++) {
    const code = basis.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x85ebca6b);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `${hex(a)}${hex(b)}`;
}

export type ArtworkMirror = {
  cachedArtworkUri: (
    remoteUrl: string | undefined,
    options?: { verify?: boolean },
  ) => string | undefined;
  ensureArtworkCached: (
    remoteUrl: string | undefined,
  ) => Promise<string | undefined>;
  refreshIndex: () => void;
  clearArtworkCache: () => void;
};

/**
 * A mirror rooted at `Paths.cache/<dirName>`, holding at most `maxEntries`
 * covers.
 *
 * Paths.cache, not Paths.document: every entry is re-derivable from the server,
 * so the OS is welcome to reclaim it under storage pressure, and it should not
 * ride along in a backup.
 */
export function createArtworkMirror(
  dirName: string,
  maxEntries: number,
): ArtworkMirror {
  const artworkDir = (): Directory => new Directory(Paths.cache, dirName);

  // No extension: both decoders sniff the content (BitmapFactory, UIImage), and
  // a cover served as PNG under a .jpg name would be a lie on disk.
  const fileFor = (key: string): File => new File(artworkDir(), key);

  // What the directory holds, by cache key → modification time in ms. Every
  // expo-file-system property read (`exists`, `modificationTime`, even
  // constructing a `File`) is a synchronous JSI → Kotlin round trip costing a
  // few ms, and the car browse tree asks about a cover once per track node —
  // 20k nodes froze the JS thread for close to a minute (issue #205). Listing
  // the directory once and answering from memory makes that lookup free; the
  // index is kept current by our own writes/deletes and re-listed on demand
  // by callers about to issue a burst of lookups (see `refreshIndex`).
  let index: Map<string, number> | null = null;
  let dirUri: string | null = null;

  // expo-file-system reports seconds on some platforms and milliseconds on
  // others; normalize by magnitude rather than trusting either. A missing
  // timestamp (not reported on every platform) counts as fresh and lets the
  // entry age out via the count cap instead.
  const toMs = (modified: number | null | undefined): number => {
    if (modified == null) return Date.now();
    return modified > 1e11 ? modified : modified * 1000;
  };
  const isFresh = (modifiedMs: number): boolean =>
    Date.now() - modifiedMs < MAX_AGE_MS;

  function loadIndex(): Map<string, number> {
    const loaded = new Map<string, number>();
    try {
      const dir = artworkDir();
      dirUri = dir.uri;
      if (dir.exists) {
        for (const entry of dir.list()) {
          if (entry instanceof File) {
            loaded.set(entry.name, toMs(entry.modificationTime));
          }
        }
      }
    } catch {
      // An unreadable directory behaves like an empty one; the next write
      // re-creates it.
    }
    return loaded;
  }

  const entries = (): Map<string, number> => {
    if (!index) index = loadIndex();
    return index;
  };

  const uriFor = (key: string): string => {
    if (dirUri == null) dirUri = artworkDir().uri;
    return dirUri.endsWith("/") ? `${dirUri}${key}` : `${dirUri}/${key}`;
  };

  function remove(key: string): void {
    try {
      fileFor(key).delete();
    } catch {}
    entries().delete(key);
  }

  /**
   * The already-downloaded local URI for `remoteUrl`, or undefined.
   *
   * Synchronous by design: the caller applies lock-screen metadata during a
   * track change and needs an answer without yielding, so a warm cover appears
   * on the very first notification rather than flashing in a moment later.
   *
   * Answered from the in-memory index, so it is cheap enough to call per list
   * item. `verify` additionally stats the file — for the one-shot callers
   * (lock screen, now-playing) where handing out a URI the OS has since
   * reclaimed would leave the controls blank, and one native call is nothing.
   */
  function cachedArtworkUri(
    remoteUrl: string | undefined,
    { verify = false }: { verify?: boolean } = {},
  ): string | undefined {
    if (!isRemote(remoteUrl)) return undefined;
    const key = cacheKey(remoteUrl);
    const modified = entries().get(key);
    if (modified == null || !isFresh(modified)) return undefined;
    if (verify) {
      let exists = false;
      try {
        exists = fileFor(key).exists;
      } catch {}
      if (!exists) {
        entries().delete(key);
        return undefined;
      }
    }
    return uriFor(key);
  }

  /**
   * Forget the in-memory view of the directory so the next lookup re-lists it.
   *
   * The OS may reclaim files from Paths.cache behind our back; callers that
   * are about to hand out many URIs at once (a browse-tree build) call this
   * first so the burst is answered from a fresh listing — one directory read
   * instead of one stat per item.
   */
  function refreshIndex(): void {
    index = null;
  }

  // Drop the oldest entries once the directory outgrows the cap, and anything
  // past its TTL. Runs after a successful download, so the cap is enforced
  // lazily rather than on a timer.
  function prune(): void {
    const current = entries();
    for (const [key, modified] of Array.from(current)) {
      if (!isFresh(modified)) remove(key);
    }
    if (current.size <= maxEntries) return;
    Array.from(current)
      .sort((a, b) => a[1] - b[1])
      .slice(0, current.size - maxEntries)
      .forEach(([key]) => remove(key));
  }

  const inFlight = new Map<string, Promise<string | undefined>>();

  /**
   * Ensure `remoteUrl` is mirrored locally, returning the `file://` URI.
   *
   * Returns undefined when the URL isn't remote or the fetch failed — callers
   * fall back to handing the consumer the remote URL, which is no worse than
   * before.
   */
  async function ensureArtworkCached(
    remoteUrl: string | undefined,
  ): Promise<string | undefined> {
    if (!isRemote(remoteUrl)) return undefined;
    const hit = cachedArtworkUri(remoteUrl);
    if (hit) return hit;

    const pending = inFlight.get(remoteUrl);
    if (pending) return pending;

    const task = (async () => {
      try {
        const discard = (why: string) => {
          if (__DEV__) console.log(`[artwork] discarded ${remoteUrl}: ${why}`);
          return undefined;
        };

        // `fetch`, not `File.downloadFileAsync`: expo-file-system downloads
        // through a bare `OkHttpClient()` of its own (FileSystemDownload.kt),
        // which never sees the custom SSL socket factory modules/ssl-trust
        // installs — so a self-signed server, the exact case this mirror exists
        // to serve, would fail here. React Native's fetch goes through
        // `OkHttpClientProvider`, which does carry it.
        //
        // Bounded: fetch has no timeout of its own, and callers run a pool of
        // these (the car mirrors a whole browse tree at fixed concurrency), so
        // one cover on a stalled connection would otherwise hold a slot forever.
        const abort = new AbortController();
        const deadline = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
        let bytes: Uint8Array;
        try {
          const response = await fetch(remoteUrl, {
            headers: requestHeadersForUrl(remoteUrl),
            signal: abort.signal,
          });
          if (!response.ok) return discard(`status ${response.status}`);
          // Inside the deadline too: a server that answers headers promptly and
          // then trickles the body is the same stalled slot.
          bytes = new Uint8Array(await response.arrayBuffer());
        } finally {
          clearTimeout(deadline);
        }
        if (bytes.byteLength < MIN_COVER_BYTES) {
          return discard(`only ${bytes.byteLength} bytes`);
        }
        // A server behind an authenticating proxy, an expired session or a CDN
        // having a bad day answers with an HTML error page rather than an image.
        if (!looksLikeImage(bytes.subarray(0, 4))) {
          return discard("not an image (probably an HTML error page)");
        }

        const dir = artworkDir();
        dir.create({ idempotent: true, intermediates: true });
        const key = cacheKey(remoteUrl);
        const target = fileFor(key);
        // A stale-but-present file would keep its old modification time, which
        // is what the TTL reads; delete so the refresh really is a new entry.
        if (target.exists) {
          try {
            target.delete();
          } catch {}
        }
        target.create();
        target.write(bytes);
        entries().set(key, Date.now());

        prune();
        return target.uri;
      } catch (error) {
        // Not reported to Sentry: a server that's briefly unreachable, or a
        // track with no cover, is an ordinary outcome. The consumer just keeps
        // whatever artwork it had.
        if (__DEV__) console.log(`[artwork] failed ${remoteUrl}: ${error}`);
        return undefined;
      }
    })();

    inFlight.set(remoteUrl, task);
    const forget = () => {
      inFlight.delete(remoteUrl);
    };
    void task.then(forget, forget);
    return task;
  }

  /**
   * Drop every mirrored cover. The entries belong to a server the user is
   * leaving, and the whole directory is re-derivable, so there's nothing to
   * preserve.
   */
  function clearArtworkCache(): void {
    inFlight.clear();
    index = null;
    try {
      const dir = artworkDir();
      if (dir.exists) dir.delete();
    } catch {
      // Best effort.
    }
  }

  return {
    cachedArtworkUri,
    ensureArtworkCached,
    refreshIndex,
    clearArtworkCache,
  };
}
