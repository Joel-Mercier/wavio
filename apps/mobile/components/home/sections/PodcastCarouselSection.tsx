import { useTranslation } from "react-i18next";
import HomeSection from "@/components/home/sections/HomeSection";
import PodcastSeriesListItemSkeleton from "@/components/podcasts/PodcastSeriesListItemSkeleton";
import ServerPodcastChannelListItem from "@/components/podcasts/ServerPodcastChannelListItem";
import { useGetPodcasts } from "@/hooks/backend/usePodcasts";
import { loadingData } from "@/utils/loadingData";

interface PodcastCarouselSectionProps {
  enabled: boolean;
}

export default function PodcastCarouselSection({
  enabled,
}: PodcastCarouselSectionProps) {
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
      skeleton={loadingData(4).map((_, index) => (
        <PodcastSeriesListItemSkeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
          key={`podcast-skeleton-${index}`}
          index={index}
          layout="horizontal"
        />
      ))}
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
