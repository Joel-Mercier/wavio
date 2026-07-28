import type { ArtistID3 } from "@/services/openSubsonic/types";

// Recommendations fetched with `includeNotPresent` come back for artists the
// library doesn't hold, and Subsonic marks those with a sentinel id shared by
// every one of them. Such a row carries nothing but a name — no coverArt, no
// MusicBrainz id, and an `artistImageUrl` that is the server's generic
// placeholder rather than the artist's own picture.
const NOT_PRESENT_ID = "-1";

export const isArtistInLibrary = (artist: Pick<ArtistID3, "id">) =>
  !!artist.id && artist.id !== NOT_PRESENT_ID;

// The sentinel id repeats across rows, so it can't identify one. Names can
// repeat too in theory, but within a single recommendation list they don't.
export const artistListKey = (artist: Pick<ArtistID3, "id" | "name">) =>
  isArtistInLibrary(artist) ? artist.id : `not-in-library:${artist.name}`;
