import type { Href } from "expo-router";
import { memo } from "react";
import AlbumListItem from "@/components/albums/AlbumListItem";
import { useSectionEnabled } from "@/components/home/enabledSections";
import HomeSection from "@/components/home/sections/HomeSection";
import { ALBUM_CAROUSEL_SKELETON } from "@/components/home/sections/skeletons";
import { useAlbumList2 } from "@/hooks/backend/useLists";
import type { AlbumListType } from "@/services/backend/lists";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";

interface AlbumCarouselSectionProps {
  title: string;
  type: AlbumListType;
  sectionIndex: number;
  seeAllHref?: Href;
  genre?: string;
  fromYear?: number;
  toYear?: number;
  size?: number;
}

function AlbumCarouselSection({
  title,
  type,
  sectionIndex,
  seeAllHref,
  genre,
  fromYear,
  toYear,
  size = 12,
}: AlbumCarouselSectionProps) {
  const enabled = useSectionEnabled(sectionIndex);
  const musicFolderId = useCurrentMusicFolderId();
  const { data, isLoading, error } = useAlbumList2(
    { type, size, musicFolderId, genre, fromYear, toYear },
    { enabled },
  );
  const albums = data?.albumList2?.album;
  return (
    <HomeSection
      title={title}
      seeAllHref={seeAllHref}
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

export default memo(AlbumCarouselSection);
