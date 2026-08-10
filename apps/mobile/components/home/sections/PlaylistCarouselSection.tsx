import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSectionEnabled } from "@/components/home/enabledSections";
import HomeSection from "@/components/home/sections/HomeSection";
import { PLAYLIST_CAROUSEL_SKELETON } from "@/components/home/sections/skeletons";
import PlaylistListItem from "@/components/playlists/PlaylistListItem";
import { usePlaylists } from "@/hooks/backend/usePlaylists";
import type { Playlist } from "@/services/openSubsonic/types";
import { sampleWithSeed } from "@/utils/shuffle";

interface PlaylistCarouselSectionProps {
  sectionIndex: number;
  size?: number;
  shuffleSeed?: number;
}

function PlaylistCarouselSection({
  sectionIndex,
  size = 12,
  shuffleSeed,
}: PlaylistCarouselSectionProps) {
  const enabled = useSectionEnabled(sectionIndex);
  const { t } = useTranslation();
  const [mountSeed] = useState(() => Date.now());
  const seed = shuffleSeed ?? mountSeed;
  const { data, isLoading, error } = usePlaylists({}, { enabled });
  const playlists = useMemo<Playlist[]>(() => {
    const all = data?.playlists?.playlist ?? [];
    return sampleWithSeed(all, size, seed);
  }, [data?.playlists?.playlist, seed, size]);
  return (
    <HomeSection
      title={t("app.home.yourPlaylists")}
      seeAllHref="/(app)/(tabs)/(home)/playlists"
      isLoading={!enabled || isLoading}
      error={error}
      isEmpty={!playlists.length}
      skeleton={PLAYLIST_CAROUSEL_SKELETON}
    >
      {playlists.map((playlist, index) => (
        <PlaylistListItem
          key={playlist.id}
          playlist={playlist}
          index={index}
          layout="horizontal"
        />
      ))}
    </HomeSection>
  );
}

export default memo(PlaylistCarouselSection);
