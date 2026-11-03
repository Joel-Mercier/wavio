type TrackKind = { id: string; isRadio?: boolean; source?: unknown };

// Podcast episodes and audiobook files carry ids from their own services
// (Taddy, a feed, Audiobookshelf), never a music server's track id.
export function isSpokenWordTrack(
  track: TrackKind | null | undefined,
): boolean {
  return track?.source === "podcast" || track?.source === "audiobook";
}

/** A track the music library (server or on-device index) knows by its id. */
export function isLibraryTrack<T extends TrackKind>(
  track: T | null | undefined,
): track is T {
  return !!track && !track.isRadio && !isSpokenWordTrack(track);
}
