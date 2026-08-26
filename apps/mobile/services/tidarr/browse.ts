import { tidalProxyRequest } from "@/services/tidarr";
import type {
  TidalAlbum,
  TidalArtist,
  TidalPagedList,
  TidalPageModule,
  TidalPageResponse,
  TidalTrack,
} from "@/services/tidarr/types";

const DISCOGRAPHY_PAGE_LIMIT = 100;

export interface TidarrDiscographySection {
  key: string;
  albums: TidalAlbum[];
}

export interface TidarrAlbumPage {
  album?: TidalAlbum;
  tracks: TidalTrack[];
}

function modulesOf<T>(page: TidalPageResponse<T> | undefined) {
  return (page?.rows ?? []).flatMap((row) => row.modules ?? []);
}

// Album pages put the album in one module and its tracklist in another, each
// track wrapped as `{ item }`. Positions shift with the page layout, so both
// are found by shape rather than by index.
export async function getAlbumPage(albumId: string): Promise<TidarrAlbumPage> {
  const page = await tidalProxyRequest<TidalPageResponse<{ item: TidalTrack }>>(
    "/v1/pages/album",
    { albumId },
  );
  const modules = modulesOf(page);
  const album = modules.find((m) => m.album)?.album;
  const trackModule = modules.find((m: TidalPageModule<{ item: TidalTrack }>) =>
    m.pagedList?.items?.some((entry) => entry?.item),
  );
  const tracks = (trackModule?.pagedList?.items ?? [])
    .map((entry) => entry?.item)
    .filter((track): track is TidalTrack => !!track);

  return { album, tracks };
}

export async function getArtist(artistId: string): Promise<TidalArtist> {
  return tidalProxyRequest<TidalArtist>(`/v1/artists/${artistId}`);
}

// The same endpoint Tidarr's own discography expansion uses, split by filter so
// proper albums and singles stay separate sections in the UI. Preferred over
// /v1/pages/artist: a flat list beats parsing whichever modules the page ships.
async function getArtistAlbumsByFilter(
  artistId: string,
  filter: "ALBUMS" | "EPSANDSINGLES" | "COMPILATIONS",
): Promise<TidalAlbum[]> {
  const data = await tidalProxyRequest<TidalPagedList<TidalAlbum>>(
    `/v1/artists/${artistId}/albums`,
    { filter, limit: DISCOGRAPHY_PAGE_LIMIT, offset: 0 },
  );
  return data?.items ?? [];
}

export async function getArtistDiscography(
  artistId: string,
): Promise<TidarrDiscographySection[]> {
  const [albums, singles, compilations] = await Promise.all([
    getArtistAlbumsByFilter(artistId, "ALBUMS"),
    getArtistAlbumsByFilter(artistId, "EPSANDSINGLES"),
    getArtistAlbumsByFilter(artistId, "COMPILATIONS"),
  ]);

  return [
    { key: "albums", albums },
    { key: "singles", albums: singles },
    { key: "compilations", albums: compilations },
  ].filter((section) => section.albums.length > 0);
}
