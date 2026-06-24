// Builds a filesystem-safe filename from a track title (with extension),
// used when saving a downloaded track to the device media library so the
// saved file is named after what the user sees in the app rather than its id.
export function safeFileName(
  title: string | undefined,
  suffix: string | undefined,
  fallback: string,
): string {
  const ext = suffix || "mp3";
  const base = (title ?? "")
    // Characters not allowed in file names on common file systems.
    .replace(/[/\\?%*:|"<>]/g, "")
    // Collapse any run of whitespace (including newlines/tabs) to a single space.
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
    .trim();

  return `${base || fallback}.${ext}`;
}
