import { getIsEffectivelyOnline } from "@/services/network";
import type { MediaId } from "../mediaId";
import { audiobooksListing } from "./audiobooks";
import {
  downloadsKindListing,
  downloadsListing,
  offlineCollectionListing,
  savedCollectionListing,
} from "./downloads";
import {
  albumListing,
  artistListing,
  artistsListing,
  favoritesKindListing,
  genreListing,
  genresListing,
  playlistListing,
  playlistsListing,
} from "./library";
import { mixesListing } from "./mixes";
import { podcastListing, podcastsListing } from "./podcasts";
import { radioListing } from "./radio";
import { runSearch } from "./search";
import {
  albumRowListing,
  albumsListing,
  favoritesListing,
  homeListing,
  libraryListing,
  recentListing,
  rootListing,
} from "./sections";
import type { Listing } from "./shared";

async function sectionListing(
  key: Extract<MediaId, { kind: "section" }>["key"],
): Promise<Listing> {
  switch (key) {
    case "home":
      return homeListing();
    case "library":
      return libraryListing();
    case "downloads":
      return downloadsListing();
    case "recent":
      return recentListing();
    case "favorites":
      return favoritesListing();
    case "playlists":
      return playlistsListing();
    case "albums":
      return albumsListing();
    case "artists":
      return artistsListing();
    case "genres":
      return genresListing();
    case "radio":
      return radioListing();
    case "mixes":
      return mixesListing();
    case "podcasts":
      return podcastsListing();
    case "audiobooks":
      return audiobooksListing();
  }
}

// Offline, an album or playlist id can only be answered from its download:
// search hits, recents and voice requests all name it by its server id.
const savedOffline = (kind: "album" | "playlist", id: string) =>
  getIsEffectivelyOnline() ? null : savedCollectionListing(kind, id);

export async function listChildren(id: MediaId): Promise<Listing | null> {
  switch (id.kind) {
    case "root":
      return rootListing();
    case "section":
      return sectionListing(id.key);
    case "row":
      return id.key === "mixes" ? mixesListing() : albumRowListing(id.key);
    case "album":
      return savedOffline("album", id.id) ?? albumListing(id.id);
    case "playlist":
      return savedOffline("playlist", id.id) ?? playlistListing(id.id);
    case "artist":
      return artistListing(id.id);
    case "genre":
      return genreListing(id.name);
    case "favorites":
      return favoritesKindListing(id.of);
    case "downloads":
      return downloadsKindListing(id.of);
    case "offlineCollection":
      return offlineCollectionListing(id.id);
    case "podcast":
      return podcastListing(id.source, id.id);
    case "search":
      return runSearch(id.query);
    default:
      return null;
  }
}
