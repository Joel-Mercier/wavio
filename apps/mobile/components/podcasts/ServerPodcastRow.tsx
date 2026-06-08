import type { ReactNode } from "react";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import PodcastSeriesListItemSkeleton from "@/components/podcasts/PodcastSeriesListItemSkeleton";
import ServerPodcastChannelListItem from "@/components/podcasts/ServerPodcastChannelListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { ScrollView } from "@/components/ui/scroll-view";
import type { OpenSubsonicErrorResponse } from "@/services/openSubsonic";
import type { PodcastChannel } from "@/services/openSubsonic/types";
import { loadingData } from "@/utils/loadingData";

interface ServerPodcastRowProps {
  title: ReactNode;
  isLoading?: boolean;
  error?: OpenSubsonicErrorResponse | Error | null;
  channels?: PodcastChannel[] | null;
  skeletonKey: string;
  skeletonCount?: number;
}

export default function ServerPodcastRow({
  title,
  isLoading,
  error,
  channels,
  skeletonKey,
  skeletonCount = 4,
}: ServerPodcastRowProps) {
  return (
    <>
      <Box className="px-6 mt-4 mb-4">
        <Heading size="xl" className="text-white">
          {title}
        </Heading>
      </Box>
      {error ? (
        <ErrorDisplay error={error as OpenSubsonicErrorResponse | Error} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="mb-6 pl-6"
        >
          {isLoading
            ? loadingData(skeletonCount).map((_, index) => (
                <PodcastSeriesListItemSkeleton
                  key={`${skeletonKey}-${index}`}
                  index={index}
                  layout="horizontal"
                />
              ))
            : channels?.map((channel, index) => (
                <ServerPodcastChannelListItem
                  key={channel.id}
                  channel={channel}
                  index={index}
                  layout="horizontal"
                />
              ))}
        </ScrollView>
      )}
      {!isLoading && !error && !channels?.length && <EmptyDisplay />}
    </>
  );
}
