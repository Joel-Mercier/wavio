import { LegendList } from "@legendapp/list/react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import AudiobookCard from "@/components/audiobooks/AudiobookCard";
import AudiobookFavoriteToggle from "@/components/audiobooks/AudiobookFavoriteToggle";
import AudiobookScreenHeader from "@/components/audiobooks/AudiobookScreenHeader";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import RichText from "@/components/RichText";
import TabHeaderGradient from "@/components/TabHeaderGradient";
import { Box } from "@/components/ui/box";
import { Spinner } from "@/components/ui/spinner";
import {
  useAbsProgressMap,
  useAbsSeries,
} from "@/hooks/audiobookshelf/useAudiobookshelf";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type {
  AbsLibraryItem,
  AbsSeriesRef,
} from "@/services/audiobookshelf/types";
import { absAuthorName, absTitle } from "@/utils/audiobookToTrack";

function sequenceOf(item: AbsLibraryItem, seriesId: string): string | null {
  const series = item.media.metadata.series;
  const list: AbsSeriesRef[] = Array.isArray(series)
    ? series
    : series
      ? [series]
      : [];
  return list.find((s) => s.id === seriesId)?.sequence ?? null;
}

export default function AudiobookSeriesScreen() {
  const { t } = useTranslation();
  const screenBottomPadding = useScreenBottomPadding();
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const { series, books } = useAbsSeries(params.id);
  const progress = useAbsProgressMap();
  const name = series.data?.name ?? params.name ?? "";
  const items = books.data ?? [];

  return (
    <Box className="h-full">
      <TabHeaderGradient />
      <AudiobookScreenHeader
        title={name}
        right={
          <AudiobookFavoriteToggle
            favorite={{
              kind: "series",
              id: params.id,
              name,
              coverItemId: items[0]?.id,
            }}
          />
        }
      />
      {books.error ? (
        <ErrorDisplay error={books.error} />
      ) : books.isLoading ? (
        <Spinner className="mt-10" />
      ) : (
        <LegendList
          recycleItems
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }: { item: AbsLibraryItem }) => {
            const sequence = sequenceOf(item, params.id);
            return (
              <AudiobookCard
                itemId={item.id}
                title={
                  sequence
                    ? t("app.audiobooks.bookSequence", {
                        sequence,
                        title: absTitle(item),
                      })
                    : absTitle(item)
                }
                subtitle={absAuthorName(item)}
                progress={progress.get(item.id)}
                layout="vertical"
              />
            );
          }}
          ListHeaderComponent={
            series.data?.description ? (
              <RichText className="text-md text-primary-50 px-6 mb-4">
                {series.data.description}
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
