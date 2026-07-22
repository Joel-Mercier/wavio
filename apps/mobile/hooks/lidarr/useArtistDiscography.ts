import { useQuery } from "@tanstack/react-query";
import {
  ensureArtistForBrowsing,
  getArtistAlbums,
} from "@/services/lidarr/library";
import useLidarr from "@/stores/lidarr";
import { useResolvedAddDefaults } from "./useAddAlbum";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// An artist's real discography. Lidarr only exposes an artist's album list once
// the artist is in its library, so this ensures the artist exists (added
// unmonitored, no download) then reads GET /album?artistId. Returns the internal
// artistId and whether it was created, so the screen can clean up an artist the
// user browsed but never committed to.
export function useArtistDiscography(
  foreignArtistId: string | undefined,
  artistName: string | undefined,
) {
  const isConnected = useLidarr((s) => s.isConnected);
  const { defaults } = useResolvedAddDefaults();
  const id = (foreignArtistId ?? "").trim();
  return useQuery({
    queryKey: ["lidarr", "artistDiscography", id],
    enabled: isConnected && id.length > 0 && !!defaults,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { artistId, created } = await ensureArtistForBrowsing(
        { foreignArtistId: id, artistName },
        // enabled guards defaults presence.
        defaults as NonNullable<typeof defaults>,
      );
      // A freshly-added artist populates its album list via an async metadata
      // refresh, so GET /album?artistId can be briefly empty — poll until ready.
      let albums = await getArtistAlbums(artistId);
      if (created && albums.length === 0) {
        const started = Date.now();
        while (albums.length === 0 && Date.now() - started < 12000) {
          await delay(1500);
          albums = await getArtistAlbums(artistId);
        }
      }
      return { artistId, created, albums };
    },
  });
}
