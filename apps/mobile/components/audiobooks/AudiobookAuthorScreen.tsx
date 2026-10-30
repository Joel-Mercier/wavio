import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { AuthorAvatar } from "@/components/audiobooks/AudiobookAuthorCard";
import AudiobookCard from "@/components/audiobooks/AudiobookCard";
import AudiobookFavoriteToggle from "@/components/audiobooks/AudiobookFavoriteToggle";
import AudiobookScreenHeader from "@/components/audiobooks/AudiobookScreenHeader";
import AudiobookShelfRow from "@/components/audiobooks/AudiobookShelfRow";
import ErrorDisplay from "@/components/ErrorDisplay";
import RichText from "@/components/RichText";
import TabHeaderGradient from "@/components/TabHeaderGradient";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { VStack } from "@/components/ui/vstack";
import {
  useAbsAuthor,
  useAbsProgressMap,
} from "@/hooks/audiobookshelf/useAudiobookshelf";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { absAuthorName, absTitle } from "@/utils/audiobookToTrack";

export default function AudiobookAuthorScreen() {
  const { t } = useTranslation();
  const screenBottomPadding = useScreenBottomPadding();
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const { data: author, error, isLoading } = useAbsAuthor(params.id);
  const progress = useAbsProgressMap();
  const name = author?.name ?? params.name ?? "";
  const books = author?.libraryItems ?? [];
  const series = (author?.series ?? []).map((s) => ({
    ...s,
    books: s.items ?? s.books ?? [],
  }));

  return (
    <Box className="h-full">
      <TabHeaderGradient />
      <AudiobookScreenHeader
        title={name}
        right={
          <AudiobookFavoriteToggle
            favorite={{ kind: "author", id: params.id, name }}
          />
        }
      />
      {error ? (
        <ErrorDisplay error={error} />
      ) : isLoading ? (
        <Spinner className="mt-10" />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: screenBottomPadding }}
          showsVerticalScrollIndicator={false}
        >
          <VStack className="items-center px-6 gap-y-4">
            <AuthorAvatar
              authorId={params.id}
              hasImage={!!author?.imagePath}
              size="lg"
            />
            {!!author?.description && (
              <RichText className="text-md text-primary-50">
                {author.description}
              </RichText>
            )}
          </VStack>
          {series.length > 0 && (
            <AudiobookShelfRow
              title={t("app.audiobooks.browse.series")}
              shelf={{ type: "series", entities: series }}
              progress={progress}
            />
          )}
          <Box className="px-6 mt-4 mb-2">
            <Heading size="xl" className="text-white">
              {t("app.audiobooks.browse.books")}
            </Heading>
          </Box>
          {books.map((item) => (
            <AudiobookCard
              key={item.id}
              itemId={item.id}
              title={absTitle(item)}
              subtitle={absAuthorName(item)}
              progress={progress.get(item.id)}
              layout="vertical"
            />
          ))}
        </ScrollView>
      )}
    </Box>
  );
}
