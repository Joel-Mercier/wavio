import { memo } from "react";
import { useTranslation } from "react-i18next";
import { useSectionEnabled } from "@/components/home/enabledSections";
import HomeSection from "@/components/home/sections/HomeSection";
import { PODCAST_CAROUSEL_SKELETON } from "@/components/home/sections/skeletons";
import ServerPodcastChannelListItem from "@/components/podcasts/ServerPodcastChannelListItem";
import { useGetPodcasts } from "@/hooks/backend/usePodcasts";

interface PodcastCarouselSectionProps {
  sectionIndex: number;
}

function PodcastCarouselSection({ sectionIndex }: PodcastCarouselSectionProps) {
  const enabled = useSectionEnabled(sectionIndex);
  const { t } = useTranslation();
  const { data, isLoading, error } = useGetPodcasts({ enabled });
  const channels = data?.podcasts?.channel?.slice(0, 12);
  return (
    <HomeSection
      title={t("app.home.podcasts")}
      seeAllHref="/(app)/(tabs)/(home)/podcasts"
      isLoading={!enabled || isLoading}
      error={error}
      isEmpty={!channels?.length}
      skeleton={PODCAST_CAROUSEL_SKELETON}
    >
      {channels?.map((channel, index) => (
        <ServerPodcastChannelListItem
          key={channel.id}
          channel={channel}
          index={index}
          layout="horizontal"
        />
      ))}
    </HomeSection>
  );
}

export default memo(PodcastCarouselSection);
