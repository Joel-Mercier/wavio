import { useQuery } from "@tanstack/react-query";
import { TIDARR_NETWORK_MODE } from "@/hooks/tidarr/networkMode";
import {
  getAlbumPage,
  getArtist,
  getArtistDiscography,
} from "@/services/tidarr/browse";
import useTidarr from "@/stores/tidarr";

export function useTidarrAlbum(albumId: string | undefined) {
  const isConnected = useTidarr((store) => store.isConnected);
  return useQuery({
    queryKey: ["tidarr", "album", albumId],
    queryFn: () => getAlbumPage(albumId as string),
    enabled: isConnected && !!albumId,
    networkMode: TIDARR_NETWORK_MODE,
    staleTime: 1000 * 60 * 5,
  });
}

export function useTidarrArtist(artistId: string | undefined) {
  const isConnected = useTidarr((store) => store.isConnected);
  return useQuery({
    queryKey: ["tidarr", "artist", artistId],
    queryFn: () => getArtist(artistId as string),
    enabled: isConnected && !!artistId,
    networkMode: TIDARR_NETWORK_MODE,
    staleTime: 1000 * 60 * 5,
  });
}

export function useTidarrDiscography(artistId: string | undefined) {
  const isConnected = useTidarr((store) => store.isConnected);
  return useQuery({
    queryKey: ["tidarr", "discography", artistId],
    queryFn: () => getArtistDiscography(artistId as string),
    enabled: isConnected && !!artistId,
    networkMode: TIDARR_NETWORK_MODE,
    staleTime: 1000 * 60 * 5,
  });
}
