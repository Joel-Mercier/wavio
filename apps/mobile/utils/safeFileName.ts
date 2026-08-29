// Strips characters disallowed in file names on common file systems, plus ones
// that are legal in a name but illegal in a `file://` URI — `[] # {} ^ \`` and
// control chars — which java.net.URI (inside downloadFileAsync) rejects. `[` /
// `]` are common in track titles ("Song [Live]"), so this matters. `/` must go
// too: Android's SAF rejects a child name containing a path separator.
export function sanitizePathSegment(value: string | undefined): string {
  return (
    (value ?? "")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally stripping control chars from filenames
      .replace(/[/\\?%*:|"<>[\]#{}^`\x00-\x1F]/g, "")
      // Collapse any run of whitespace (including newlines/tabs) to a single space.
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100)
      .trim()
      // A trailing dot is stripped by Windows and by some Android providers,
      // which would silently rename the folder out from under a stored path.
      .replace(/\.+$/, "")
      .trim()
  );
}

// Builds a filesystem-safe filename from a track title (with extension),
// used when saving a downloaded track to the device media library so the
// saved file is named after what the user sees in the app rather than its id.
export function safeFileName(
  title: string | undefined,
  suffix: string | undefined,
  fallback: string,
): string {
  const ext = suffix || "mp3";
  return `${sanitizePathSegment(title) || fallback}.${ext}`;
}
