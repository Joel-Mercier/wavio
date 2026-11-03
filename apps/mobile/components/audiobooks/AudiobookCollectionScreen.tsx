import { LegendList } from "@legendapp/list/react-native";
import { useLocalSearchParams } from "expo-router";
import AudiobookCard from "@/components/audiobooks/AudiobookCard";
import AudiobookScreenHeader from "@/components/audiobooks/AudiobookScreenHeader";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import RichText from "@/components/RichText";
import TabHeaderGradient from "@/components/TabHeaderGradient";
import { Box } from "@/components/ui/box";
import { Spinner } from "@/components/ui/spinner";
import {
  useAbsCollection,
  useAbsProgressMap,
} from "@/hooks/audiobookshelf/useAudiobookshelf";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { AbsLibraryItem } from "@/services/audiobookshelf/types";
import { absAuthorName, absTitle } from "@/utils/audiobookToTrack";

export default function AudiobookCollectionScreen() {
  const screenBottomPadding = useScreenBottomPadding();
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const { data, error, isLoading } = useAbsCollection(params.id);
  const progress = useAbsProgressMap();

  return (
    <Box className="h-full">
      <TabHeaderGradient />
      <AudiobookScreenHeader title={data?.name ?? params.name ?? ""} />
      {error ? (
        <ErrorDisplay error={error} />
      ) : isLoading ? (
        <Spinner className="mt-10" />
      ) : (
        <LegendList
          recycleItems
          data={data?.books ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }: { item: AbsLibraryItem }) => (
            <AudiobookCard
              itemId={item.id}
              title={absTitle(item)}
              subtitle={absAuthorName(item)}
              progress={progress.get(item.id)}
              layout="vertical"
            />
          )}
          ListHeaderComponent={
            data?.description ? (
              <RichText className="text-md text-primary-50 px-6 mb-4">
                {data.description}
              </RichText>
            ) : null
          }
          ListEmptyComponent={<EmptyDisplay />}
          contentContainerStyle={{ paddingBottom: screenBottomPadding }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Box>
  );
}
