import type { Href } from "expo-router";
import AlbumListItem from "@/components/albums/AlbumListItem";
import AlbumListItemSkeleton from "@/components/albums/AlbumListItemSkeleton";
import HomeSection from "@/components/home/sections/HomeSection";
import { useAlbumList2 } from "@/hooks/backend/useLists";
import type { AlbumListType } from "@/services/backend/lists";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { loadingData } from "@/utils/loadingData";

interface AlbumCarouselSectionProps {
  title: string;
  type: AlbumListType;
  enabled: boolean;
  seeAllHref?: Href;
  genre?: string;
  fromYear?: number;
  toYear?: number;
  size?: number;
}

export default function AlbumCarouselSection({
  title,
  type,
  enabled,
  seeAllHref,
  genre,
  fromYear,
  toYear,
  size = 12,
}: AlbumCarouselSectionProps) {
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
      skeleton={loadingData(4).map((_, index) => (
        <AlbumListItemSkeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
          key={`album-skeleton-${index}`}
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
