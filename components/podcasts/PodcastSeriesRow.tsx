import type { ReactNode } from "react";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import PodcastSeriesListItem from "@/components/podcasts/PodcastSeriesListItem";
import PodcastSeriesListItemSkeleton from "@/components/podcasts/PodcastSeriesListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { ScrollView } from "@/components/ui/scroll-view";
import type { OpenSubsonicErrorResponse } from "@/services/openSubsonic";
import type { PodcastSeries } from "@/services/taddyPodcasts/types";
import { loadingData } from "@/utils/loadingData";

interface PodcastSeriesRowProps {
  title: ReactNode;
  isLoading?: boolean;
  error?: OpenSubsonicErrorResponse | Error | null;
  podcastSeries?: PodcastSeries[] | null;
  skeletonKey: string;
  skeletonCount?: number;
}

export default function PodcastSeriesRow({
  title,
  isLoading,
  error,
  podcastSeries,
  skeletonKey,
  skeletonCount = 4,
}: PodcastSeriesRowProps) {
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
            : podcastSeries?.map((podcast, index) => (
                <PodcastSeriesListItem
                  key={podcast.uuid}
                  podcast={podcast}
                  index={index}
                  layout="horizontal"
                />
              ))}
        </ScrollView>
      )}
      {!isLoading && !error && !podcastSeries?.length && <EmptyDisplay />}
    </>
  );
}
