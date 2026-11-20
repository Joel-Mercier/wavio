import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSectionEnabled } from "@/components/home/enabledSections";
import HomeSection from "@/components/home/sections/HomeSection";
import SongCard from "@/components/home/sections/SongCard";
import { SONG_CAROUSEL_SKELETON } from "@/components/home/sections/skeletons";
import { useStarred2 } from "@/hooks/backend/useLists";
import { useCurrentMusicFolderIds } from "@/stores/musicFolders";
import type { QueueSource } from "@/stores/queue";
import { FAVORITES_QUEUE_SOURCE_ID } from "@/utils/activeRecentPlay";

function StarredSongsSection({ sectionIndex }: { sectionIndex: number }) {
  const enabled = useSectionEnabled(sectionIndex);
  const { t } = useTranslation();
  const musicFolderIds = useCurrentMusicFolderIds();
  const { data, isLoading, error } = useStarred2(
    { musicFolderIds },
    { enabled },
  );
  const songs = data?.starred2?.song;
  const shownSongs = songs?.slice(0, 12);
  const source = useMemo<QueueSource>(
    () => ({
      type: "likedSongs",
      id: FAVORITES_QUEUE_SOURCE_ID,
      name: t("app.favorites.title"),
    }),
    [t],
  );
  return (
    <HomeSection
      title={t("app.home.starredSongs")}
      seeAllHref="/favorites"
      isLoading={!enabled || isLoading}
      error={error}
      isEmpty={!shownSongs?.length}
      skeleton={SONG_CAROUSEL_SKELETON}
    >
      {songs &&
        shownSongs?.map((song, index) => (
          <SongCard
            key={song.id}
            track={song}
            trackList={songs}
            index={index}
            source={source}
          />
        ))}
    </HomeSection>
  );
}

export default memo(StarredSongsSection);
