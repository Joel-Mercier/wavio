import { useTranslation } from "react-i18next";
import AlbumListItem from "@/components/albums/AlbumListItem";
import AlbumListItemSkeleton from "@/components/albums/AlbumListItemSkeleton";
import HomeSection from "@/components/home/sections/HomeSection";
import { useStarred2 } from "@/hooks/backend/useLists";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { loadingData } from "@/utils/loadingData";

interface StarredSectionProps {
  enabled: boolean;
}

export default function StarredSection({ enabled }: StarredSectionProps) {
  const { t } = useTranslation();
  const musicFolderId = useCurrentMusicFolderId();
  const { data, isLoading, error } = useStarred2(
    { musicFolderId },
    { enabled },
  );
  const albums = data?.starred2?.album?.slice(0, 12);
  return (
    <HomeSection
      title={t("app.home.starred")}
      seeAllHref="/favorites"
      isLoading={!enabled || isLoading}
      error={error}
      isEmpty={!albums?.length}
      skeleton={loadingData(4).map((_, index) => (
        <AlbumListItemSkeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
          key={`starred-skeleton-${index}`}
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
