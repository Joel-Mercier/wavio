import type { Href } from "expo-router";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import AlbumListItem from "@/components/albums/AlbumListItem";
import { useSectionEnabled } from "@/components/home/enabledSections";
import HomeSection from "@/components/home/sections/HomeSection";
import { ALBUM_CAROUSEL_SKELETON } from "@/components/home/sections/skeletons";
import { useLeastPlayedAlbums } from "@/hooks/backend/useLists";
import { useCurrentMusicFolderIds } from "@/stores/musicFolders";

const SEE_ALL_HREF: Href = {
  pathname: "/(app)/(tabs)/(home)/least-played",
  params: { type: "leastPlayed" },
};

function LeastPlayedAlbumsSection({ sectionIndex }: { sectionIndex: number }) {
  const { t } = useTranslation();
  const enabled = useSectionEnabled(sectionIndex);
  const musicFolderIds = useCurrentMusicFolderIds();
  const { data, isLoading, error } = useLeastPlayedAlbums(
    { size: 12, musicFolderIds },
    { enabled },
  );
  const albums = data?.albumList2?.album;
  return (
    <HomeSection
      title={t("app.home.leastPlayed")}
      seeAllHref={SEE_ALL_HREF}
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

export default memo(LeastPlayedAlbumsSection);
