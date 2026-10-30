import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { LegendList } from "@legendapp/list/react-native";
import { useLocalSearchParams } from "expo-router";
import ArrowUpDown from "lucide-react-native/icons/arrow-up-down";
import ListFilter from "lucide-react-native/icons/list-filter";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import AudiobookAuthorCard from "@/components/audiobooks/AudiobookAuthorCard";
import AudiobookCard from "@/components/audiobooks/AudiobookCard";
import AudiobookScreenHeader from "@/components/audiobooks/AudiobookScreenHeader";
import AudiobookSeriesCard from "@/components/audiobooks/AudiobookSeriesCard";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SelectBottomSheet from "@/components/SelectBottomSheet";
import TabHeaderGradient from "@/components/TabHeaderGradient";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useAbsAuthors,
  useAbsCollections,
  useAbsFilterData,
  useAbsLibraryItems,
  useAbsProgressMap,
  useAbsSeriesList,
} from "@/hooks/audiobookshelf/useAudiobookshelf";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import {
  type AbsItemsSort,
  encodeFilter,
} from "@/services/audiobookshelf/library";
import type {
  AbsAuthor,
  AbsCollection,
  AbsLibraryItem,
  AbsSeries,
} from "@/services/audiobookshelf/types";
import { absAuthorName, absTitle } from "@/utils/audiobookToTrack";
import { cn } from "@/utils/tailwind";

type View = "books" | "series" | "authors" | "collections";
const VIEWS: View[] = ["books", "series", "authors", "collections"];

const SORT_LABELS: Partial<Record<AbsItemsSort, string>> = {
  "media.metadata.title": "title",
  "media.metadata.authorName": "author",
  addedAt: "addedAt",
  "media.metadata.publishedYear": "publishedYear",
  "media.duration": "duration",
  progress: "progress",
};
const SORTS = Object.keys(SORT_LABELS) as AbsItemsSort[];

const PROGRESS_FILTERS = ["not-started", "in-progress", "finished"] as const;

function BooksView() {
  const { t } = useTranslation();
  const [gray200] = Uniwind.getCSSVariable(["--color-gray-200"]) as string[];
  const screenBottomPadding = useScreenBottomPadding();
  const [sort, setSort] = useState<AbsItemsSort>("media.metadata.title");
  const [desc, setDesc] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const sortSheetRef = useRef<BottomSheetModal>(null);
  const filterSheetRef = useRef<BottomSheetModal>(null);
  const { data: filterData } = useAbsFilterData();
  const progress = useAbsProgressMap();
  const query = useAbsLibraryItems({
    sort,
    desc,
    filter: filter ?? undefined,
  });
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.results) ?? [],
    [query.data],
  );

  const filterOptions = useMemo(
    () => [
      { label: t("app.audiobooks.filters.all"), value: "" },
      ...PROGRESS_FILTERS.map((value) => ({
        label: t(`app.audiobooks.filters.${value}`),
        value: encodeFilter("progress", value),
      })),
      ...(filterData?.genres ?? []).map((genre) => ({
        label: t("app.audiobooks.filters.genre", { genre }),
        value: encodeFilter("genres", genre),
      })),
      ...(filterData?.narrators ?? []).map((narrator) => ({
        label: t("app.audiobooks.filters.narrator", { narrator }),
        value: encodeFilter("narrators", narrator),
      })),
    ],
    [filterData, t],
  );
  const activeFilterLabel = filterOptions.find(
    (option) => option.value === (filter ?? ""),
  )?.label;

  return (
    <>
      <HStack className="px-6 mb-2 gap-x-3 items-center">
        <FadeOutScaleDown onPress={() => sortSheetRef.current?.present()}>
          <HStack className="items-center gap-x-2 rounded-full bg-primary-600 px-3 py-1">
            <ArrowUpDown size={14} color={gray200} />
            <Text className="text-white text-sm">
              {t(`app.audiobooks.sorts.${SORT_LABELS[sort]}`)}
            </Text>
          </HStack>
        </FadeOutScaleDown>
        <FadeOutScaleDown onPress={() => setDesc((d) => !d)}>
          <Text className="text-primary-100 text-sm">
            {desc
              ? t("app.audiobooks.sortDescending")
              : t("app.audiobooks.sortAscending")}
          </Text>
        </FadeOutScaleDown>
        <FadeOutScaleDown onPress={() => filterSheetRef.current?.present()}>
          <HStack
            className={cn(
              "items-center gap-x-2 rounded-full px-3 py-1",
              filter ? "bg-emerald-600" : "bg-primary-600",
            )}
          >
            <ListFilter size={14} color={gray200} />
            <Text className="text-white text-sm" numberOfLines={1}>
              {filter ? activeFilterLabel : t("app.audiobooks.filters.title")}
            </Text>
          </HStack>
        </FadeOutScaleDown>
      </HStack>
      {query.error ? (
        <ErrorDisplay error={query.error} />
      ) : query.isLoading ? (
        <Spinner className="mt-10" />
      ) : (
        <LegendList
          recycleItems
          data={items}
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
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage)
              void query.fetchNextPage();
          }}
          ListFooterComponent={
            query.isFetchingNextPage ? <Spinner className="my-4" /> : null
          }
          ListEmptyComponent={<EmptyDisplay />}
          contentContainerStyle={{ paddingBottom: screenBottomPadding }}
          showsVerticalScrollIndicator={false}
        />
      )}
      <SelectBottomSheet
        sheetRef={sortSheetRef}
        title={t("app.audiobooks.sortTitle")}
        options={SORTS.map((value) => ({
          label: t(`app.audiobooks.sorts.${SORT_LABELS[value]}`),
          value,
        }))}
        selectedValues={[sort]}
        onSelect={(value) => setSort(value as AbsItemsSort)}
      />
      <SelectBottomSheet
        sheetRef={filterSheetRef}
        title={t("app.audiobooks.filters.title")}
        options={filterOptions}
        selectedValues={[filter ?? ""]}
        onSelect={(value) => setFilter(value || null)}
        searchable={filterOptions.length > 10}
      />
    </>
  );
}

function SeriesView() {
  const screenBottomPadding = useScreenBottomPadding();
  const query = useAbsSeriesList();
  const series = useMemo(
    () => query.data?.pages.flatMap((page) => page.results) ?? [],
    [query.data],
  );
  if (query.error) return <ErrorDisplay error={query.error} />;
  if (query.isLoading) return <Spinner className="mt-10" />;
  return (
    <LegendList
      recycleItems
      data={series}
      keyExtractor={(item) => item.id}
      renderItem={({ item }: { item: AbsSeries }) => (
        <AudiobookSeriesCard
          seriesId={item.id}
          name={item.name}
          coverItemId={item.books?.[0]?.id}
          bookCount={item.books?.length}
          layout="vertical"
        />
      )}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage)
          void query.fetchNextPage();
      }}
      ListEmptyComponent={<EmptyDisplay />}
      contentContainerStyle={{ paddingBottom: screenBottomPadding }}
      showsVerticalScrollIndicator={false}
    />
  );
}

function AuthorsView() {
  const screenBottomPadding = useScreenBottomPadding();
  const { data, error, isLoading } = useAbsAuthors();
  if (error) return <ErrorDisplay error={error} />;
  if (isLoading) return <Spinner className="mt-10" />;
  return (
    <LegendList
      recycleItems
      data={data ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }: { item: AbsAuthor }) => (
        <AudiobookAuthorCard
          authorId={item.id}
          name={item.name}
          hasImage={!!item.imagePath}
          bookCount={item.numBooks}
          layout="vertical"
        />
      )}
      ListEmptyComponent={<EmptyDisplay />}
      contentContainerStyle={{ paddingBottom: screenBottomPadding }}
      showsVerticalScrollIndicator={false}
    />
  );
}

function CollectionsView() {
  const { t } = useTranslation();
  const screenBottomPadding = useScreenBottomPadding();
  const { data, error, isLoading } = useAbsCollections();
  if (error) return <ErrorDisplay error={error} />;
  if (isLoading) return <Spinner className="mt-10" />;
  return (
    <LegendList
      recycleItems
      data={data ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }: { item: AbsCollection }) => (
        <FadeOutScaleDown
          href={{
            pathname: "/audiobooks/collections/[id]",
            params: { id: item.id, name: item.name },
          }}
          className="px-6 py-3"
        >
          <VStack>
            <Heading size="md" className="text-white">
              {item.name}
            </Heading>
            <Text className="text-primary-100 text-sm">
              {t("app.audiobooks.bookCount", { count: item.books.length })}
            </Text>
          </VStack>
        </FadeOutScaleDown>
      )}
      ListEmptyComponent={<EmptyDisplay />}
      contentContainerStyle={{ paddingBottom: screenBottomPadding }}
      showsVerticalScrollIndicator={false}
    />
  );
}

export default function AudiobookLibraryScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<View>(
    VIEWS.includes(params.view as View) ? (params.view as View) : "books",
  );
  return (
    <Box className="h-full">
      <TabHeaderGradient />
      <AudiobookScreenHeader title={t(`app.audiobooks.browse.${view}`)} />
      <Box>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="pl-6 pr-4 mb-4 gap-x-2"
        >
          {VIEWS.map((v) => (
            <FadeOutScaleDown key={v} onPress={() => setView(v)}>
              <Badge
                className={cn(
                  "rounded-full px-4 py-1",
                  v === view ? "bg-emerald-500" : "bg-primary-500",
                )}
              >
                <BadgeText className="normal-case text-md text-white">
                  {t(`app.audiobooks.browse.${v}`)}
                </BadgeText>
              </Badge>
            </FadeOutScaleDown>
          ))}
        </ScrollView>
      </Box>
      <Box className="flex-1">
        {view === "books" ? (
          <BooksView />
        ) : view === "series" ? (
          <SeriesView />
        ) : view === "authors" ? (
          <AuthorsView />
        ) : (
          <CollectionsView />
        )}
      </Box>
    </Box>
  );
}
