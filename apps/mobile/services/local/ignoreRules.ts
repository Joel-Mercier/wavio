import ignore from "ignore";
import type { FileSource, RemoteEntry } from "@/services/fileSource/types";

// Directory-level exclusion, the convention every media server ships under its
// own filename: Jellyfin's `.ignore`, Navidrome's `.ndignore`, Android's
// `.nomedia`. They agree on the shape — an empty file hides the directory and
// everything beneath it, a non-empty one is a gitignore-format pattern list
// scoped to the directory that declares it and cascading into its children.
//
// This sits above the FileSource seam rather than inside any one source, so the
// same file works whether the tree is reached over SMB, over WebDAV or off this
// phone's storage. Its only entry point is the scanner's walk (see indexer.ts).

/**
 * Existence-only marker. Contents are irrelevant by spec
 * (`MediaStore.MEDIA_IGNORE_FILENAME`), so this one is never opened.
 */
const MARKER_FILENAME = ".nomedia";

/** Read for patterns; empty (or whitespace-only) means "hide this directory". */
const PATTERN_FILENAMES = [".ignore", ".ndignore"];

// A pattern list is a handful of lines. The cap exists only so a file that
// isn't what its name claims can't be pulled into memory whole.
const MAX_IGNORE_BYTES = 64 * 1024;

/** One ignore file's rules, anchored at the directory that declared them. */
export type IgnoreScope = {
  /** Declaring directory, relative to the scan root. `""` at the root. */
  base: string;
  matcher: ignore.Ignore;
};

export type DirectoryIgnore =
  /** Skip this directory and its whole subtree. */
  | { kind: "excluded" }
  /** These rules now apply here and below. */
  | { kind: "rules"; scope: IgnoreScope }
  | { kind: "none" };

const NONE: DirectoryIgnore = { kind: "none" };
const EXCLUDED: DirectoryIgnore = { kind: "excluded" };

/**
 * What the ignore files in an already-listed directory say about it.
 *
 * @param entries The directory's own listing, so this costs no extra round trip
 *   unless an ignore file is actually there.
 * @param relative The directory's path relative to the scan root.
 * @throws Whatever the source throws when the ignore file can't be read. The
 *   caller must treat that as an unreadable directory — indexing a subtree
 *   whose rules we failed to read would surface folders the user hid.
 */
export async function readDirectoryIgnore(
  source: FileSource,
  entries: RemoteEntry[],
  relative: string,
): Promise<DirectoryIgnore> {
  let patternFile: RemoteEntry | undefined;
  let patternRank = PATTERN_FILENAMES.length;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    // Not an early exit from the loop's perspective: `.nomedia` wins over a
    // pattern file no matter which order the listing returned them in.
    if (entry.name === MARKER_FILENAME) return EXCLUDED;
    // Same reasoning for a directory holding both pattern files: rank decides,
    // not arrival order. No listing order is specified — PROPFIND, an SMB
    // directory query and Directory.list() each answer in their own — so
    // picking the first seen would let one tree index two different ways.
    const rank = PATTERN_FILENAMES.indexOf(entry.name);
    if (rank !== -1 && rank < patternRank) {
      patternRank = rank;
      patternFile = entry;
    }
  }
  if (!patternFile) return NONE;

  // Read unconditionally rather than trusting `entry.size`: webdavMultistatus
  // falls back to 0 whenever `getcontentlength` is absent or unparseable, so a
  // server that omits it would make a real pattern list look like an empty
  // marker and silently drop the whole folder.
  const text = await readText(source, patternFile.path);
  if (!text.trim()) return EXCLUDED;
  return {
    kind: "rules",
    scope: {
      base: relative,
      // `allowRelativePaths` keeps a pathological entry name from throwing out
      // of the walk; it only disables the argument validation, not matching.
      matcher: ignore({ allowRelativePaths: true }).add(text),
    },
  };
}

/** Whether the nearest rules that have an opinion hide this entry. */
export function isIgnored(
  scopes: IgnoreScope[],
  relative: string,
  isDirectory: boolean,
): boolean {
  // A directory-only pattern (`samples/`) matches only when the tested path
  // carries the trailing slash too.
  const candidate = isDirectory ? `${relative}/` : relative;
  // Nearest scope first, stopping at the first one that has an opinion, because
  // that is how gitignore resolves a conflict between two files: a deeper
  // `!keep.wav` re-includes what an ancestor's `*.wav` hid. OR-ing every scope
  // instead would make a negation unable to ever win.
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i];
    // Every scope was pushed on the way down, so its base is a prefix of
    // `relative`; the slice is the path the ignore file's author wrote their
    // patterns against.
    const scoped = scope.base
      ? candidate.slice(scope.base.length + 1)
      : candidate;
    if (scoped.length === 0) continue;
    // `test` distinguishes "no rule matched" from "a negation matched", which
    // `ignores` collapses into the same false.
    const { ignored, unignored } = scope.matcher.test(scoped);
    if (ignored) return true;
    if (unignored) return false;
  }
  return false;
}

async function readText(source: FileSource, path: string): Promise<string> {
  const reader = await source.openReader(path);
  let bytes: Uint8Array;
  try {
    bytes = await reader.read(0, MAX_IGNORE_BYTES);
  } finally {
    reader.close();
  }
  // Strip a UTF-8 BOM: an editor that adds one would otherwise glue it to the
  // first pattern.
  return new TextDecoder().decode(bytes).replace(/^\uFEFF/, "");
}
