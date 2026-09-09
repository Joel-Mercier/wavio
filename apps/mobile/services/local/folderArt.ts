import { type Directory, File, FileMode } from "expo-file-system";
import type { FileSource, RemoteEntry } from "@/services/fileSource/types";
import { requestHeadersForUrl } from "@/services/serverHeaders";
import { looksLikeImage } from "@/utils/imageBytes";

// Sidecar cover art: the `cover.jpg` / `front.png` / `artist.jpg` that sits in a
// folder next to the tracks rather than inside them. Every server in this space
// implements it — Navidrome's `CoverArtPriority` defaults to
// `cover.*, folder.*, front.*, embedded`, Jellyfin takes `folder`/`cover`/
// `poster`/`default` and states that external images beat embedded metadata,
// beets' `fetchart` looks for `cover front art album folder` — so a library
// tagged for any of them already carries the files.
//
// Like ignoreRules.ts this sits *above* the FileSource seam: the convention is
// "an image file beside the audio", which is equally true of this phone's
// storage, a WebDAV collection and an SMB share. The scanner's walk already has
// the directory listing in hand, so recognising a candidate costs no round trip.
//
// Which filenames count is the caller's business (see services/local/artNames.ts
// for the defaults and the user's edited list); this module only ranks what it
// is given.

// Answering "is it jpg only?": no. Navidrome accepts anything whose extension
// maps to an `image/*` MIME. This list is that, narrowed to what expo-image
// decodes on *both* platforms and what `looksLikeImage` can vouch for — a format
// we can't sniff would be admitted on the strength of its extension alone and
// then render as a blank tile, which is worse than not picking it up.
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

// A cover this large is a scan of a booklet, not a thumbnail source, and on a
// share it would be pulled over the network for every folder that has one.
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
// Below this it's a tracking pixel or a truncated download, not a cover.
const MIN_IMAGE_BYTES = 256;

/** `cover.1.jpg` / `cover-2.png` — a numbered sibling of the real thing. */
const NUMBERED_SUFFIX = /[._-]\d+$/;

/** Lowercased extension, or undefined when it isn't an image we can render. */
export function imageExtension(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const extension = name.slice(dot + 1).toLowerCase();
  return extension in MIME_BY_EXTENSION ? extension : undefined;
}

const mimeFor = (extension: string): string => MIME_BY_EXTENSION[extension];

/**
 * The best sidecar image in an already-listed directory, or undefined.
 *
 * Matching is case-insensitive (`Cover.JPG` counts) because that is what every
 * implementation does — Navidrome lowercases the filename before matching its
 * pattern — and because a share may well be case-preserving but not
 * case-sensitive. Ranking is by the position in `names`, then un-numbered before
 * numbered (`cover.jpg` beats `cover.1.jpg`, Navidrome's tie-break), then by
 * name so the same directory always resolves the same way whatever order
 * `Directory.list()`, PROPFIND or an SMB query happened to return.
 */
export function pickFolderImage(
  entries: RemoteEntry[],
  names: readonly string[],
): RemoteEntry | undefined {
  let best: RemoteEntry | undefined;
  let bestRank = Number.POSITIVE_INFINITY;
  let bestNumbered = true;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const extension = imageExtension(entry.name);
    if (!extension) continue;
    const stem = entry.name.slice(0, -(extension.length + 1)).toLowerCase();
    const numbered = NUMBERED_SUFFIX.test(stem);
    const rank = names.indexOf(
      numbered ? stem.replace(NUMBERED_SUFFIX, "") : stem,
    );
    if (rank === -1) continue;
    if (
      best &&
      !(
        rank < bestRank ||
        (rank === bestRank && !numbered && bestNumbered) ||
        (rank === bestRank &&
          numbered === bestNumbered &&
          entry.name < best.name)
      )
    ) {
      continue;
    }
    best = entry;
    bestRank = rank;
    bestNumbered = numbered;
  }
  return best;
}

/**
 * What identifies the *bytes* behind a candidate, so an unchanged image is
 * recognised without touching the network. Plain text rather than a digest: it
 * lives in a column, never in a filename, and being readable makes a stale row
 * diagnosable.
 *
 * Returns undefined when the source reported neither a size nor an mtime (a
 * WebDAV server that omits `getcontentlength`, see webdavMultistatus.ts), which
 * the caller must read as "can't tell — re-fetch".
 */
export function folderImageKey(entry: RemoteEntry): string | undefined {
  if (!entry.size && !entry.mtime) return undefined;
  return `${entry.path}|${entry.size}|${entry.mtime}`;
}

export type MirroredImage = { path: string; mime: string };

let tempCounter = 0;

/**
 * Copy a sidecar image into the library's artwork directory, returning a
 * `file://` URI for it.
 *
 * Mirroring rather than referencing the original is not a choice on a share —
 * `utils/artwork.ts` hands an index-backed cover value straight to `<Image>` as
 * a plain string, so there is nowhere to attach the share's credentials, and
 * `smb:` is not a scheme anything can open. Doing it for the device source too
 * keeps one code path and one shape of stored value: a SAF `content://` cover
 * would otherwise reach Android Auto's `CarArtwork.apply`, which routes anything
 * that isn't `file://` to the car host as a URI it cannot read.
 *
 * The mirrored file is named by the content's MD5, so a replaced cover lands
 * under a new URI — which is what invalidates expo-image's URL-keyed
 * `memory-disk` cache — while the same picture shared by several folders is
 * stored once.
 *
 * Returns null on any failure; a folder without a usable cover is an ordinary
 * outcome, never a reason to fail the scan.
 */
export async function mirrorFolderImage(
  source: FileSource,
  entry: RemoteEntry,
  dir: Directory,
): Promise<MirroredImage | null> {
  const extension = imageExtension(entry.name);
  if (!extension) return null;
  // Only a hint: `size` is 0 on a source that can't report one, and the real
  // check happens on the downloaded file below.
  if (entry.size > MAX_IMAGE_BYTES) return null;

  tempCounter += 1;
  const temp = new File(dir, `.tmp-${Date.now()}-${tempCounter}.${extension}`);
  const discard = (): null => {
    try {
      if (temp.exists) temp.delete();
    } catch {
      // Best effort: a stray temp file is collected by the next scan's prune.
    }
    return null;
  };

  try {
    if (temp.exists) temp.delete();
    if (source.kind === "device") {
      await new File(entry.path).copy(temp);
    } else {
      const url = source.playableUrl(entry.path);
      await File.downloadFileAsync(url, temp, {
        headers: requestHeadersForUrl(url),
        idempotent: true,
      });
    }
    if (!temp.exists) return discard();
    if (temp.size < MIN_IMAGE_BYTES || temp.size > MAX_IMAGE_BYTES) {
      return discard();
    }
    // A share behind an authenticating proxy answers with an HTML login page
    // under the requested filename; sniff rather than trust the extension.
    // Only the magic is read, so a 10 MB cover isn't pulled into JS for it.
    const handle = temp.open(FileMode.ReadOnly);
    let head: Uint8Array;
    try {
      head = handle.readBytes(4);
    } finally {
      handle.close();
    }
    if (!looksLikeImage(head)) return discard();

    const digest = temp.md5;
    if (!digest) return discard();
    const target = new File(dir, `folderart-${digest}.${extension}`);
    if (target.exists) {
      temp.delete();
    } else {
      try {
        await temp.move(target);
      } catch (error) {
        // Two folders can share one image — a compilation's discs, a label's
        // re-used cover — and mirroring runs several workers at once, so both
        // can find the content-hashed destination missing and race to fill it.
        // The loser lost nothing: the bytes it was writing are already there.
        if (!target.exists) throw error;
        discard();
      }
    }
    return { path: target.uri, mime: mimeFor(extension) };
  } catch {
    return discard();
  }
}
