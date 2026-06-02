import type { ReactNode } from "react";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import InternetRadioStationListItem, {
  type RadioStationItem,
} from "@/components/internetRadioStations/InternetRadioStationListItem";
import InternetRadioStationListItemSkeleton from "@/components/internetRadioStations/InternetRadioStationListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { ScrollView } from "@/components/ui/scroll-view";
import { loadingData } from "@/utils/loadingData";

interface RadioStationRowProps {
  title: ReactNode;
  isLoading?: boolean;
  error?: Error | null;
  stations?: RadioStationItem[] | null;
  skeletonKey: string;
  skeletonCount?: number;
}

export default function RadioStationRow({
  title,
  isLoading,
  error,
  stations,
  skeletonKey,
  skeletonCount = 4,
}: RadioStationRowProps) {
  return (
    <>
      <Box className="px-6 mt-4 mb-4">
        <Heading size="xl" className="text-white">
          {title}
        </Heading>
      </Box>
      {error ? (
        <ErrorDisplay error={error} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="mb-6 pl-6"
        >
          {isLoading
            ? loadingData(skeletonCount).map((_, index) => (
                <InternetRadioStationListItemSkeleton
                  key={`${skeletonKey}-${index}`}
                />
              ))
            : stations?.map((station, index) => (
                <InternetRadioStationListItem
                  key={station.id}
                  station={station}
                  index={index}
                  layout="horizontal"
                />
              ))}
        </ScrollView>
      )}
      {!isLoading && !error && !stations?.length && <EmptyDisplay />}
    </>
  );
}
