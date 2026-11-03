import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import AudiobookAuthorCard from "@/components/audiobooks/AudiobookAuthorCard";
import AudiobookCard from "@/components/audiobooks/AudiobookCard";
import AudiobookSeriesCard from "@/components/audiobooks/AudiobookSeriesCard";
import { AudiobooksNotConfigured } from "@/components/audiobooks/AudiobooksScreen";
import HomeTabsNav from "@/components/home/HomeTabsNav";
import TabHeaderGradient from "@/components/TabHeaderGradient";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { useAbsProgressMap } from "@/hooks/audiobookshelf/useAudiobookshelf";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import useAudiobookshelf, {
  type AbsFavoriteKind,
} from "@/stores/audiobookshelf";

const SECTIONS: { kind: AbsFavoriteKind; label: string }[] = [
  { kind: "book", label: "app.audiobooks.browse.books" },
  { kind: "series", label: "app.audiobooks.browse.series" },
  { kind: "author", label: "app.audiobooks.browse.authors" },
];

export default function AudiobookFavoritesScreen() {
  const { t } = useTranslation();
  const screenBottomPadding = useScreenBottomPadding();
  const isConnected = useAudiobookshelf((s) => s.isConnected);
  const favorites = useAudiobookshelf((s) => s.favorites);
  const progress = useAbsProgressMap();
  const byKind = useMemo(
    () =>
      Object.fromEntries(
        SECTIONS.map(({ kind }) => [
          kind,
          favorites.filter((f) => f.kind === kind),
        ]),
      ) as Record<AbsFavoriteKind, typeof favorites>,
    [favorites],
  );

  return (
    <Box className="h-full">
      <TabHeaderGradient />
      <HomeTabsNav active="audiobookFavorites" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: screenBottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        {!isConnected && favorites.length === 0 ? (
          <AudiobooksNotConfigured />
        ) : favorites.length === 0 ? (
          <Text className="text-primary-100 text-center px-10 mt-10">
            {t("app.audiobooks.noFavorites")}
          </Text>
        ) : (
          <>
            <Text className="text-primary-100 text-sm px-6 mb-2">
              {t("app.audiobooks.favoritesOnDevice")}
            </Text>
            {SECTIONS.map(({ kind, label }) =>
              byKind[kind].length === 0 ? null : (
                <Box key={kind}>
                  <Box className="px-6 mt-4 mb-2">
                    <Heading size="xl" className="text-white">
                      {t(label)}
                    </Heading>
                  </Box>
                  {byKind[kind].map((favorite) =>
                    kind === "book" ? (
                      <AudiobookCard
                        key={favorite.id}
                        itemId={favorite.id}
                        title={favorite.name}
                        subtitle={favorite.subtitle}
                        progress={progress.get(favorite.id)}
                        layout="vertical"
                      />
                    ) : kind === "series" ? (
                      <AudiobookSeriesCard
                        key={favorite.id}
                        seriesId={favorite.id}
                        name={favorite.name}
                        coverItemId={favorite.coverItemId}
                        layout="vertical"
                      />
                    ) : (
                      <AudiobookAuthorCard
                        key={favorite.id}
                        authorId={favorite.id}
                        name={favorite.name}
                        hasImage
                        layout="vertical"
                      />
                    ),
                  )}
                </Box>
              ),
            )}
          </>
        )}
      </ScrollView>
    </Box>
  );
}
