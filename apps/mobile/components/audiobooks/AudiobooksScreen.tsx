import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import Search from "lucide-react-native/icons/search";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import AudiobookCard from "@/components/audiobooks/AudiobookCard";
import AudiobookShelfRow from "@/components/audiobooks/AudiobookShelfRow";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import HomeTabsNav from "@/components/home/HomeTabsNav";
import SelectBottomSheet from "@/components/SelectBottomSheet";
import TabHeaderGradient from "@/components/TabHeaderGradient";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useAbsProgressMap,
  useAbsShelves,
} from "@/hooks/audiobookshelf/useAudiobookshelf";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { AbsShelf } from "@/services/audiobookshelf/types";
import useAudiobookDownloadsBase from "@/stores/audiobookDownloads";
import useAudiobookProgressBase from "@/stores/audiobookProgress";
import useAudiobookshelf from "@/stores/audiobookshelf";

export const AUDIOBOOKSHELF_SETTINGS_HREF = "/integrations/audiobookshelf";

const BROWSE_VIEWS = ["books", "series", "authors", "collections"] as const;

function shelfTitle(
  t: (key: string, options?: Record<string, unknown>) => string,
  shelf: AbsShelf,
) {
  return t(`app.audiobooks.shelves.${shelf.id}`, { defaultValue: shelf.label });
}

export function AudiobooksNotConfigured() {
  const { t } = useTranslation();
  return (
    <Box className="items-center px-6 mt-10">
      <Text className="text-primary-50 text-center">
        {t("app.audiobooks.notConfigured")}
      </Text>
      <Center>
        <FadeOutScaleDown
          href={AUDIOBOOKSHELF_SETTINGS_HREF}
          className="mt-6 items-center justify-center py-3 px-8 border border-white rounded-full"
        >
          <Text className="text-white font-bold text-lg">
            {t("app.audiobooks.configure")}
          </Text>
        </FadeOutScaleDown>
      </Center>
    </Box>
  );
}

function DownloadedBooksRow() {
  const { t } = useTranslation();
  const downloads = useAudiobookDownloadsBase((s) => s.downloads);
  const books = useAudiobookProgressBase((s) => s.books);
  const progress = useAbsProgressMap();
  const downloaded = useMemo(
    () =>
      Object.values(downloads)
        .filter((download) => download.status === "done")
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((download) => books[download.itemId])
        .filter((book) => !!book),
    [downloads, books],
  );
  if (downloaded.length === 0) return null;
  return (
    <>
      <Box className="px-6 mt-4 mb-4">
        <Heading size="xl" className="text-white">
          {t("app.audiobooks.downloaded")}
        </Heading>
      </Box>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="mb-6 pl-6"
      >
        {downloaded.map((book) => (
          <AudiobookCard
            key={book.itemId}
            itemId={book.itemId}
            title={book.title}
            subtitle={book.author}
            progress={progress.get(book.itemId)}
          />
        ))}
      </ScrollView>
    </>
  );
}

export default function AudiobooksScreen() {
  const { t } = useTranslation();
  const [gray200] = Uniwind.getCSSVariable(["--color-gray-200"]) as string[];
  const screenBottomPadding = useScreenBottomPadding();
  const isConnected = useAudiobookshelf((s) => s.isConnected);
  const serverUrl = useAudiobookshelf((s) => s.serverUrl);
  const libraries = useAudiobookshelf((s) => s.libraries);
  const libraryId = useAudiobookshelf((s) => s.libraryId);
  const setLibraryId = useAudiobookshelf((s) => s.setLibraryId);
  const librarySheetRef = useRef<BottomSheetModal>(null);
  const { data: shelves, isLoading, error } = useAbsShelves();
  const progress = useAbsProgressMap();
  const configured = isConnected && !!serverUrl;
  const library = libraries.find((l) => l.id === libraryId);

  return (
    <Box className="flex-1 h-full">
      <TabHeaderGradient />
      <HomeTabsNav active="audiobooks" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: screenBottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        {!configured ? (
          <AudiobooksNotConfigured />
        ) : (
          <>
            <HStack className="mx-6 mb-4 gap-x-4 items-center">
              <FadeOutScaleDown href="/audiobooks/search" className="flex-1">
                <HStack className="px-4 gap-x-4 h-10 rounded-lg bg-primary-500 items-center">
                  <Search size={20} color={"rgb(128, 128, 128)"} />
                  <Text className="text-primary-100 text-sm">
                    {t("app.audiobooks.searchPlaceholder")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            </HStack>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="pl-6 pr-4 mb-2 gap-x-2"
            >
              {libraries.length > 1 && (
                <FadeOutScaleDown
                  onPress={() => librarySheetRef.current?.present()}
                >
                  <Badge className="rounded-full bg-primary-600 px-4 py-1 border border-primary-400">
                    <HStack className="items-center gap-x-1">
                      <BadgeText className="normal-case text-md text-white">
                        {library?.name ?? t("app.audiobooks.library")}
                      </BadgeText>
                      <ChevronDown size={14} color={gray200} />
                    </HStack>
                  </Badge>
                </FadeOutScaleDown>
              )}
              {BROWSE_VIEWS.map((view) => (
                <FadeOutScaleDown
                  key={view}
                  href={{
                    pathname: "/audiobooks/library",
                    params: { view },
                  }}
                >
                  <Badge className="rounded-full bg-primary-500 px-4 py-1">
                    <BadgeText className="normal-case text-md text-white">
                      {t(`app.audiobooks.browse.${view}`)}
                    </BadgeText>
                  </Badge>
                </FadeOutScaleDown>
              ))}
            </ScrollView>
            {error ? (
              <VStack className="mt-4">
                <ErrorDisplay error={error} />
                <DownloadedBooksRow />
              </VStack>
            ) : (
              <>
                {isLoading && (
                  <AudiobookShelfRow
                    title={t("app.audiobooks.shelves.continue-listening")}
                    isLoading
                    progress={progress}
                  />
                )}
                {shelves?.map((shelf) =>
                  shelf.type === "book" ||
                  shelf.type === "series" ||
                  shelf.type === "authors" ? (
                    <AudiobookShelfRow
                      key={shelf.id}
                      title={shelfTitle(t, shelf)}
                      shelf={shelf}
                      progress={progress}
                    />
                  ) : null,
                )}
                <DownloadedBooksRow />
                {!isLoading &&
                  shelves?.every((shelf) => shelf.entities.length === 0) && (
                    <Text className="text-primary-100 text-center px-6 mt-10">
                      {t("app.audiobooks.emptyLibrary")}
                    </Text>
                  )}
              </>
            )}
          </>
        )}
      </ScrollView>
      <SelectBottomSheet
        sheetRef={librarySheetRef}
        title={t("app.audiobooks.library")}
        options={libraries.map((l) => ({ label: l.name, value: l.id }))}
        selectedValues={libraryId ? [libraryId] : []}
        onSelect={setLibraryId}
      />
    </Box>
  );
}
