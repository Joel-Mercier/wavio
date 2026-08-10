import { Directory, File, Paths } from "expo-file-system";
import { coverArtArchiveUrl } from "@/services/musicbrainz";
import { looksLikeImage } from "@/utils/imageBytes";

export { looksLikeImage };

// Covers fetched from the Cover Art Archive, kept apart from `local-artwork`
// (which the indexer owns and prunes) so a rescan never deletes a downloaded
// cover, and clearing corrections never deletes extracted artwork.
const coverDir = (): Directory =>
  new Directory(Paths.document, "musicbrainz-artwork");

// A cover under this is an error page or a placeholder, not an image.
const MIN_COVER_BYTES = 1024;

// Deduplicates *concurrent* callers and nothing more. The lasting cache is the
// file on disk (the `target.exists` check below); holding settled promises here
// would hand out URIs to covers that clearDownloadedCovers has since deleted.
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Downloads a release's front cover, returning a local file URI.
 *
 * Cached by release MBID: every track on an album shares one cover, so an album
 * costs a single download rather than one per track. Concurrent callers for the
 * same release share the in-flight promise.
 *
 * Returns null on any failure — a missing cover is common (not every release has
 * one in the archive) and must never fail the correction that requested it.
 */
export async function fetchReleaseCover(
  releaseMbid: string,
): Promise<string | null> {
  const cached = inFlight.get(releaseMbid);
  if (cached) return cached;

  const task = (async () => {
    try {
      const dir = coverDir();
      dir.create({ idempotent: true, intermediates: true });

      const target = new File(dir, `${releaseMbid}.jpg`);
      if (target.exists) return target.uri;

      const result = await File.downloadFileAsync(
        coverArtArchiveUrl(releaseMbid),
        target,
        { idempotent: true },
      );
      const discard = (why: string) => {
        try {
          result.delete();
        } catch {}
        if (__DEV__) {
          console.log(
            `[musicbrainz] discarded cover for ${releaseMbid}: ${why}`,
          );
        }
        return null;
      };

      if (!result.exists) return discard("download produced no file");
      if ((result.size ?? 0) < MIN_COVER_BYTES) {
        return discard(`only ${result.size ?? 0} bytes`);
      }
      const head = (await result.bytes()).subarray(0, 4);
      if (!looksLikeImage(head)) {
        return discard("not an image (probably an HTML error page)");
      }
      return result.uri;
    } catch (error) {
      // Not reported. Plenty of releases simply have no cover in the archive, so
      // a failure here (404, or the download rejecting on one) is an ordinary
      // outcome of best-effort enrichment, not a fault worth a Sentry issue or a
      // red line in the dev console. The caller already treats null as "no
      // cover" and the correction proceeds without one.
      if (__DEV__) {
        console.log(
          `[musicbrainz] no cover art for release ${releaseMbid}: ${String(error)}`,
        );
      }
      return null;
    }
  })();

  inFlight.set(releaseMbid, task);
  // Cleanup is registered *after* the insert, deliberately. The body returns
  // synchronously whenever the cover is already on disk, so a `finally` inside
  // it ran before `set` had happened — the delete found nothing, the insert
  // landed afterwards, and the entry then stayed for the life of the process,
  // turning this into a cache that outlived the files it pointed at.
  const forget = () => {
    inFlight.delete(releaseMbid);
  };
  void task.then(forget, forget);
  return task;
}

/** Drop every downloaded cover — used when corrections are reset. */
export function clearDownloadedCovers(): void {
  // Anything still in flight is about to resolve to a URI inside the directory
  // being deleted, so it must not be handed to a later caller as a cache hit.
  inFlight.clear();
  try {
    const dir = coverDir();
    if (dir.exists) dir.delete();
  } catch {
    // Best effort: a stale cover directory is harmless.
  }
}
