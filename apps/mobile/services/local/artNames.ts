// The sidecar cover-art filenames the scanner looks for, and the parsing that
// turns a user's edited list back into them (see folderArt.ts for what actually
// picks a file, and MusicLibrarySection for the editor).
//
// Its own module, with no imports at all, because both ends need these: the
// scanner reaches them through services/local/folderArt (which pulls in
// expo-file-system), while stores/app.ts and the settings screen must not.

/**
 * Album-cover filenames, most preferred first. Deliberately an exact-stem list
 * rather than Jellyfin's "may also be a suffix" rule: `album-cover.png` is worth
 * little next to what that rule also matches, `back-cover.jpg`.
 */
export const DEFAULT_ALBUM_ART_NAMES = [
  "cover",
  "folder",
  "front",
  "album",
  "albumart",
  "art",
  "poster",
  "default",
] as const;

/** Artist-image filenames. Navidrome's `ArtistArtPriority` starts the same way. */
export const DEFAULT_ARTIST_ART_NAMES = ["artist"] as const;

// A priority list, not a filter: past a handful the tail never wins anything,
// and every extra name is another `indexOf` per file in every directory.
const MAX_NAMES = 16;
// Long enough for `albumart`, short enough that a pasted path isn't a name.
const MAX_NAME_LENGTH = 64;

/**
 * A user-entered list as the scanner wants it: lowercased, de-duplicated, in
 * priority order.
 *
 * Names are *stems*, so an extension is dropped rather than rejected —
 * `cover.jpg` and foobar2000's `cover.*` both mean `cover` here, and typing
 * either is the obvious mistake to make. The extension a file actually carries
 * is decided by `imageExtension` instead, which is a decode-safety boundary
 * rather than a preference: a stem is only ever matched against formats
 * `looksLikeImage` can vouch for.
 */
export function parseArtNames(value: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value.split(/[,\n;]/)) {
    const name = cleanArtName(raw);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= MAX_NAMES) break;
  }
  return out;
}

/** The list as the user edits it. Round-trips through `parseArtNames`. */
export function formatArtNames(names: readonly string[]): string {
  return names.join(", ");
}

/**
 * The names a scan should use: the configured list, or the defaults when it is
 * empty.
 *
 * Empty means "defaults" rather than "no sidecar art" on purpose. It keeps the
 * stored value from pinning today's defaults into everyone's MMKV — a name
 * added to `DEFAULT_ALBUM_ART_NAMES` in a later release still reaches a user
 * who never touched the setting — and it makes resetting the editor a matter of
 * clearing the field.
 */
export function artNamesOrDefault(
  configured: readonly string[] | undefined,
  fallback: readonly string[],
): readonly string[] {
  if (!configured || configured.length === 0) return fallback;
  return configured;
}

function cleanArtName(raw: string): string {
  // A leading dot is the user hiding the file, not part of the stem; a trailing
  // extension (or foobar2000's `.*`) is the shape their other player wanted.
  const trimmed = raw.trim().toLowerCase().replace(/^\.+/, "");
  const dot = trimmed.lastIndexOf(".");
  const stem = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  // Anything with a separator in it is a path, which this never matches — it is
  // compared against a single directory entry's name.
  if (stem.includes("/") || stem.includes("\\")) return "";
  return stem.slice(0, MAX_NAME_LENGTH);
}
