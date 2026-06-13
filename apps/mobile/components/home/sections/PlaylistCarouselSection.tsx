import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import HomeSection from "@/components/home/sections/HomeSection";
import PlaylistListItem from "@/components/playlists/PlaylistListItem";
import PlaylistListItemSkeleton from "@/components/playlists/PlaylistListItemSkeleton";
import { usePlaylists } from "@/hooks/backend/usePlaylists";
import type { Playlist } from "@/services/openSubsonic/types";
import { loadingData } from "@/utils/loadingData";
import { shuffleWithSeed } from "@/utils/shuffle";

interface PlaylistCarouselSectionProps {
  enabled: boolean;
  size?: number;
}

export default function PlaylistCarouselSection({
  enabled,
  size = 12,
}: PlaylistCarouselSectionProps) {
  const { t } = useTranslation();
  const [seed] = useState(() => Date.now());
  const { data, isLoading, error } = usePlaylists({}, { enabled });
  const playlists = useMemo<Playlist[]>(() => {
    const all = data?.playlists?.playlist ?? [];
    return shuffleWithSeed(all, seed).slice(0, size);
  }, [data, seed, size]);
  return (
    <HomeSection
      title={t("app.home.yourPlaylists")}
      seeAllHref="/(app)/(tabs)/(home)/playlists"
      isLoading={!enabled || isLoading}
      error={error}
      isEmpty={!playlists.length}
      skeleton={loadingData(4).map((_, index) => (
        <PlaylistListItemSkeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
          key={`playlist-skeleton-${index}`}
          index={index}
          layout="horizontal"
        />
      ))}
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
