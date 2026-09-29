import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import AlbumListItem from "@/components/albums/AlbumListItem";
import { useSectionEnabled } from "@/components/home/enabledSections";
import HomeSection from "@/components/home/sections/HomeSection";
import { ALBUM_CAROUSEL_SKELETON } from "@/components/home/sections/skeletons";
import { useArtist } from "@/hooks/backend/useBrowsing";
import { artworkUrl } from "@/utils/artwork";

interface ArtistAlbumsSectionProps {
  artistId: string;
  sectionIndex: number;
}

// The row is a plain horizontal ScrollView, so every card mounts at once; the
// artist page behind "see all" has the full, virtualised discography. Same cap
// as the other carousels.
const MAX_ALBUMS = 12;

function ArtistAlbumsSection({
  artistId,
  sectionIndex,
}: ArtistAlbumsSectionProps) {
  const enabled = useSectionEnabled(sectionIndex);
  const { t } = useTranslation();
  const { data, isLoading, error } = useArtist(enabled ? artistId : "");
  const artist = data?.artist;
  const albums = useMemo(
    () => artist?.album?.slice(0, MAX_ALBUMS),
    [artist?.album],
  );
  return (
    <HomeSection
      title={artist?.name ?? ""}
      subtitle={t("app.home.moreFrom")}
      imageUrl={artist?.coverArt ? artworkUrl(artist.coverArt) : undefined}
      seeAllHref={
        artist?.id
          ? { pathname: "/artists/[id]", params: { id: artist.id } }
          : undefined
      }
      isLoading={!enabled || isLoading}
      error={error}
      isEmpty={!albums?.length}
      skeleton={ALBUM_CAROUSEL_SKELETON}
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

export default memo(ArtistAlbumsSection);
