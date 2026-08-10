import { memo } from "react";
import { useTranslation } from "react-i18next";
import AlbumListItem from "@/components/albums/AlbumListItem";
import { useSectionEnabled } from "@/components/home/enabledSections";
import HomeSection from "@/components/home/sections/HomeSection";
import { ALBUM_CAROUSEL_SKELETON } from "@/components/home/sections/skeletons";
import { useStarred2 } from "@/hooks/backend/useLists";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";

interface StarredSectionProps {
  sectionIndex: number;
}

function StarredSection({ sectionIndex }: StarredSectionProps) {
  const enabled = useSectionEnabled(sectionIndex);
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

export default memo(StarredSection);
