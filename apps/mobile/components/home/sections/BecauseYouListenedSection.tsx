import { memo } from "react";
import { useTranslation } from "react-i18next";
import ArtistListItem from "@/components/artists/ArtistListItem";
import { useSectionEnabled } from "@/components/home/enabledSections";
import HomeSection from "@/components/home/sections/HomeSection";
import { ARTIST_CAROUSEL_SKELETON } from "@/components/home/sections/skeletons";
import { useLastFmBecauseYouListened } from "@/hooks/lastFm/useLastFmSimilarArtists";

// The home-screen cost is the top-artists request plus the artist index — both
// of which the stats screen and the artists tab already cache under the same
// keys — and one similar-artists call per seed tried. The name matching is done
// in memory against that index rather than with a search per artist; see
// useLastFmBecauseYouListened.
function BecauseYouListenedSection({
  sectionIndex,
  sessionSeed,
}: {
  sectionIndex: number;
  sessionSeed?: number;
}) {
  const { t } = useTranslation();
  const enabled = useSectionEnabled(sectionIndex);
  const { seedName, artists, isLoading, error } = useLastFmBecauseYouListened({
    enabled,
    sessionSeed,
  });

  return (
    <HomeSection
      subtitle={t("app.settings.integrations.lastfm.recommendations.poweredBy")}
      // No seed means every artist the user listens to named neighbours this
      // library hasn't got. The row is empty either way, but it still has a
      // header to print when "show empty home sections" is on, and
      // "Because you listened to " with nothing after it isn't it.
      title={
        seedName
          ? t("app.home.becauseYouListened", { artist: seedName })
          : t("app.home.becauseYouListenedFallback")
      }
      isLoading={!enabled || isLoading}
      // Folded into `isEmpty` rather than passed as `error`, like the
      // ListenBrainz row: Last.fm being down is not something to read about
      // halfway down a home feed, and the section hides itself when empty.
      isEmpty={!!error || !seedName || artists.length === 0}
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

export default memo(BecauseYouListenedSection);
