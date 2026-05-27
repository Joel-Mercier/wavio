import { useTranslation } from "react-i18next";
import AlbumListItem from "@/components/albums/AlbumListItem";
import AlbumListItemSkeleton from "@/components/albums/AlbumListItemSkeleton";
import HomeSection from "@/components/home/sections/HomeSection";
import { useArtist } from "@/hooks/backend/useBrowsing";
import { loadingData } from "@/utils/loadingData";

interface ArtistAlbumsSectionProps {
  artistId: string;
  enabled: boolean;
}

export default function ArtistAlbumsSection({
  artistId,
  enabled,
}: ArtistAlbumsSectionProps) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useArtist(enabled ? artistId : "");
  const artist = data?.artist;
  const albums = artist?.album;
  const title = t("app.home.moreFromArtist", { artist: artist?.name ?? "" });
  return (
    <HomeSection
      title={title}
      seeAllHref={
        artist?.id
          ? { pathname: "/artists/[id]", params: { id: artist.id } }
          : undefined
      }
      isLoading={!enabled || isLoading}
      error={error}
      isEmpty={!albums?.length}
      skeleton={loadingData(4).map((_, index) => (
        <AlbumListItemSkeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
          key={`artist-album-skeleton-${index}`}
          index={index}
          layout="horizontal"
        />
      ))}
    >
      {albums?.map((album, index) => (
        <AlbumListItem
          key={album.id}
          album={album}
          index={index}
          layout="horizontal"
        />
      ))}
    </HomeSection>
  );
}
