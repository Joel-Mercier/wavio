// Ids and URLs for Audiobookshelf content. A leaf module (no store, no network)
// so the player, Cast/UPnP and download paths can recognise an audiobook track
// without pulling the API client into their import graph.

const TRACK_PREFIX = "abs:";

/** Queue/download id for one audio file of a book: `abs:<itemId>:<ino>`. */
export function audiobookTrackId(itemId: string, ino: string): string {
  return `${TRACK_PREFIX}${itemId}:${ino}`;
}

export function parseAudiobookTrackId(
  id: string | null | undefined,
): { itemId: string; ino: string } | null {
  if (!id?.startsWith(TRACK_PREFIX)) return null;
  const rest = id.slice(TRACK_PREFIX.length);
  const separator = rest.lastIndexOf(":");
  if (separator <= 0 || separator === rest.length - 1) return null;
  return { itemId: rest.slice(0, separator), ino: rest.slice(separator + 1) };
}

export function isAudiobookTrackId(id: string | null | undefined): boolean {
  return parseAudiobookTrackId(id) != null;
}

// Covers are served without authentication, so the same URL works for the
// lock screen, the widget and a Cast receiver. JPEG rather than the server's
// default WebP because not every receiver decodes WebP.
export function audiobookCoverUrl(
  serverUrl: string,
  itemId: string,
  width = 400,
): string {
  return `${serverUrl}/api/items/${encodeURIComponent(itemId)}/cover?width=${width}&format=jpeg`;
}

export function authorImageUrl(
  serverUrl: string,
  authorId: string,
  width = 400,
): string {
  return `${serverUrl}/api/authors/${encodeURIComponent(authorId)}/image?width=${width}&format=jpeg`;
}

/** Authenticated (Bearer) file URL, used for local playback and downloads. */
export function audiobookFileUrl(
  serverUrl: string,
  itemId: string,
  ino: string,
): string {
  return `${serverUrl}/api/items/${encodeURIComponent(itemId)}/file/${encodeURIComponent(ino)}`;
}

export function audiobookFileDownloadUrl(
  serverUrl: string,
  itemId: string,
  ino: string,
): string {
  return `${audiobookFileUrl(serverUrl, itemId, ino)}/download`;
}

// A playback session's files are readable without credentials for as long as
// the session stays open, which is what lets a Cast receiver or UPnP renderer
// fetch them: neither can send our bearer token.
export function audiobookSessionTrackUrl(
  serverUrl: string,
  sessionId: string,
  trackIndex: number,
): string {
  return `${serverUrl}/public/session/${encodeURIComponent(sessionId)}/track/${trackIndex}`;
}
