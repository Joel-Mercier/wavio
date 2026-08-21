import { memo } from "react";
import { useTranslation } from "react-i18next";
import { useSectionEnabled } from "@/components/home/enabledSections";
import HomeSection from "@/components/home/sections/HomeSection";
import { CREATED_FOR_YOU_SKELETON } from "@/components/home/sections/skeletons";
import CreatedForYouCard from "@/components/listenBrainz/CreatedForYouCard";
import { useListenBrainzCreatedFor } from "@/hooks/listenBrainz/useListenBrainzPlaylists";

// The whole home-screen cost of the ListenBrainz playlists: one public request
// that returns metadata only. Fetching the tracks — and matching them against
// the library, which is ~60 backend searches — waits until a card is tapped.
function CreatedForYouSection({ sectionIndex }: { sectionIndex: number }) {
  const { t } = useTranslation();
  const enabled = useSectionEnabled(sectionIndex);
  const { data, isLoading, error } = useListenBrainzCreatedFor({ enabled });

  return (
    <HomeSection
      subtitle={t(
        "app.settings.integrations.listenbrainz.createdForYou.poweredBy",
      )}
      title={t("app.home.createdForYou")}
      isLoading={!enabled || isLoading}
      // Folded into `isEmpty` rather than passed as `error`: ListenBrainz being
      // down is not the user's problem to read about halfway down their home
      // feed, and the section hides itself when empty.
      isEmpty={!!error || !data?.length}
      skeleton={CREATED_FOR_YOU_SKELETON}
    >
      {data?.map((playlist) => (
        <CreatedForYouCard key={playlist.mbid} playlist={playlist} />
      ))}
    </HomeSection>
  );
}

export default memo(CreatedForYouSection);
