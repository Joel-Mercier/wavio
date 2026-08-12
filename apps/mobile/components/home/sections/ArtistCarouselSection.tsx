import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ArtistListItem from "@/components/artists/ArtistListItem";
import { useSectionEnabled } from "@/components/home/enabledSections";
import HomeSection from "@/components/home/sections/HomeSection";
import { ARTIST_CAROUSEL_SKELETON } from "@/components/home/sections/skeletons";
import { useArtists } from "@/hooks/backend/useBrowsing";
import type { ArtistID3 } from "@/services/openSubsonic/types";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { sampleWithSeed } from "@/utils/shuffle";

interface ArtistCarouselSectionProps {
  sectionIndex: number;
  size?: number;
  shuffleSeed?: number;
}

function ArtistCarouselSection({
  sectionIndex,
  size = 12,
  shuffleSeed,
}: ArtistCarouselSectionProps) {
  const enabled = useSectionEnabled(sectionIndex);
  const { t } = useTranslation();
  const musicFolderId = useCurrentMusicFolderId();
  const [mountSeed] = useState(() => Date.now());
  const seed = shuffleSeed ?? mountSeed;
  const { data, isLoading, error } = useArtists({ musicFolderId }, { enabled });
  const artists = useMemo<ArtistID3[]>(() => {
    const all =
      data?.artists?.index?.flatMap((index) => index.artist ?? []) ?? [];
    return sampleWithSeed(all, size, seed);
  }, [data?.artists?.index, seed, size]);
  return (
    <HomeSection
      title={t("app.home.artists")}
      seeAllHref="/(app)/(tabs)/(home)/artists"
      isLoading={!enabled || isLoading}
      error={error}
      isEmpty={!artists.length}
      skeleton={ARTIST_CAROUSEL_SKELETON}
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

export default memo(ArtistCarouselSection);
