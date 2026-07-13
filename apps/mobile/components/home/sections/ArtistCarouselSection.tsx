import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ArtistListItem from "@/components/artists/ArtistListItem";
import ArtistListItemSkeleton from "@/components/artists/ArtistListItemSkeleton";
import HomeSection from "@/components/home/sections/HomeSection";
import { useArtists } from "@/hooks/backend/useBrowsing";
import type { ArtistID3 } from "@/services/openSubsonic/types";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { loadingData } from "@/utils/loadingData";
import { shuffleWithSeed } from "@/utils/shuffle";

interface ArtistCarouselSectionProps {
  enabled: boolean;
  size?: number;
  shuffleSeed?: number;
}

export default function ArtistCarouselSection({
  enabled,
  size = 12,
  shuffleSeed,
}: ArtistCarouselSectionProps) {
  const { t } = useTranslation();
  const musicFolderId = useCurrentMusicFolderId();
  const [mountSeed] = useState(() => Date.now());
  const seed = shuffleSeed ?? mountSeed;
  const { data, isLoading, error } = useArtists({ musicFolderId }, { enabled });
  const artists = useMemo<ArtistID3[]>(() => {
    const all =
      data?.artists?.index?.flatMap((index) => index.artist ?? []) ?? [];
    return shuffleWithSeed(all, seed).slice(0, size);
  }, [data, seed, size]);
  return (
    <HomeSection
      title={t("app.home.artists")}
      seeAllHref="/(app)/(tabs)/(home)/artists"
      isLoading={!enabled || isLoading}
      error={error}
      isEmpty={!artists.length}
      skeleton={loadingData(4).map((_, index) => (
        <ArtistListItemSkeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
          key={`artist-skeleton-${index}`}
          index={index}
          layout="horizontal"
        />
      ))}
    >
      {artists.map((artist, index) => (
        <ArtistListItem
          key={artist.id}
          artist={artist}
          index={index}
          layout="horizontal"
        />
      ))}
    </HomeSection>
  );
}
