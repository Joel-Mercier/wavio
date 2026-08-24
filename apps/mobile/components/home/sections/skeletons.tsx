import AlbumListItemSkeleton from "@/components/albums/AlbumListItemSkeleton";
import ArtistListItemSkeleton from "@/components/artists/ArtistListItemSkeleton";
import SongCardSkeleton from "@/components/home/sections/SongCardSkeleton";
import InternetRadioStationListItemSkeleton from "@/components/internetRadioStations/InternetRadioStationListItemSkeleton";
import PlaylistListItemSkeleton from "@/components/playlists/PlaylistListItemSkeleton";
import PodcastSeriesListItemSkeleton from "@/components/podcasts/PodcastSeriesListItemSkeleton";
import { loadingData } from "@/utils/loadingData";

// Carousel skeletons take no data, so the elements are built once at module
// scope instead of on every section render — a section that has already loaded
// was still allocating four throwaway elements per render just to pass them in.
const PLACEHOLDERS = loadingData(4);

export const ALBUM_CAROUSEL_SKELETON = PLACEHOLDERS.map((_, index) => (
  <AlbumListItemSkeleton
    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
    key={`album-skeleton-${index}`}
    index={index}
    layout="horizontal"
  />
));

export const ARTIST_CAROUSEL_SKELETON = PLACEHOLDERS.map((_, index) => (
  <ArtistListItemSkeleton
    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
    key={`artist-skeleton-${index}`}
    index={index}
    layout="horizontal"
  />
));

export const PLAYLIST_CAROUSEL_SKELETON = PLACEHOLDERS.map((_, index) => (
  <PlaylistListItemSkeleton
    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
    key={`playlist-skeleton-${index}`}
    index={index}
    layout="horizontal"
  />
));

export const PODCAST_CAROUSEL_SKELETON = PLACEHOLDERS.map((_, index) => (
  <PodcastSeriesListItemSkeleton
    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
    key={`podcast-skeleton-${index}`}
    index={index}
    layout="horizontal"
  />
));

export const INTERNET_RADIO_CAROUSEL_SKELETON = PLACEHOLDERS.map((_, index) => (
  <InternetRadioStationListItemSkeleton
    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
    key={`internet-radio-skeleton-${index}`}
  />
));

// Exactly three, because that section is never longer: Daily Jams, Weekly Jams
// and Weekly Exploration are all ListenBrainz builds for a user.
export const CREATED_FOR_YOU_SKELETON = loadingData(3).map((_, index) => (
  <PlaylistListItemSkeleton
    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
    key={`created-for-you-skeleton-${index}`}
    index={index}
    layout="horizontal"
  />
));

export const SONG_CAROUSEL_SKELETON = PLACEHOLDERS.map((_, index) => (
  <SongCardSkeleton
    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
    key={`song-skeleton-${index}`}
  />
));
