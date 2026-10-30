import type { ReactNode } from "react";
import AudiobookAuthorCard from "@/components/audiobooks/AudiobookAuthorCard";
import AudiobookCard from "@/components/audiobooks/AudiobookCard";
import AudiobookSeriesCard from "@/components/audiobooks/AudiobookSeriesCard";
import PodcastSeriesListItemSkeleton from "@/components/podcasts/PodcastSeriesListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { ScrollView } from "@/components/ui/scroll-view";
import type { AbsBookProgress } from "@/hooks/audiobookshelf/useAudiobookshelf";
import type {
  AbsAuthor,
  AbsLibraryItem,
  AbsSeries,
} from "@/services/audiobookshelf/types";
import { absAuthorName, absTitle } from "@/utils/audiobookToTrack";
import { loadingData } from "@/utils/loadingData";

export type ShelfEntities =
  | { type: "book"; entities: AbsLibraryItem[] }
  | { type: "series"; entities: (AbsSeries & { books?: AbsLibraryItem[] })[] }
  | { type: "authors"; entities: AbsAuthor[] };

interface AudiobookShelfRowProps {
  title: ReactNode;
  shelf?: ShelfEntities;
  isLoading?: boolean;
  progress: Map<string, AbsBookProgress>;
  skeletonKey?: string;
}

export default function AudiobookShelfRow({
  title,
  shelf,
  isLoading,
  progress,
  skeletonKey = "abs-shelf",
}: AudiobookShelfRowProps) {
  if (!isLoading && (!shelf || shelf.entities.length === 0)) return null;
  return (
    <>
      <Box className="px-6 mt-4 mb-4">
        <Heading size="xl" className="text-white">
          {title}
        </Heading>
      </Box>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="mb-6 pl-6"
      >
        {isLoading || !shelf
          ? loadingData(4).map((_, index) => (
              <PodcastSeriesListItemSkeleton
                key={`${skeletonKey}-${index}`}
                index={index}
                layout="horizontal"
              />
            ))
          : shelf.type === "book"
            ? shelf.entities.map((item) => (
                <AudiobookCard
                  key={item.id}
                  itemId={item.id}
                  title={absTitle(item)}
                  subtitle={absAuthorName(item)}
                  progress={progress.get(item.id)}
                />
              ))
            : shelf.type === "series"
              ? shelf.entities.map((series) => (
                  <AudiobookSeriesCard
                    key={series.id}
                    seriesId={series.id}
                    name={series.name}
                    coverItemId={series.books?.[0]?.id}
                    bookCount={series.books?.length}
                  />
                ))
              : shelf.entities.map((author) => (
                  <AudiobookAuthorCard
                    key={author.id}
                    authorId={author.id}
                    name={author.name}
                    hasImage={!!author.imagePath}
                    bookCount={author.numBooks}
                  />
                ))}
      </ScrollView>
    </>
  );
}
