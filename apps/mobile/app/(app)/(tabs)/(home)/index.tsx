import { FlashList, type ViewToken } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createEnabledSectionsStore,
  EnabledSectionsProvider,
} from "@/components/home/enabledSections";
import HomeTabsNav from "@/components/home/HomeTabsNav";
import AlbumCarouselSection from "@/components/home/sections/AlbumCarouselSection";
import ArtistAlbumsSection from "@/components/home/sections/ArtistAlbumsSection";
import ArtistCarouselSection from "@/components/home/sections/ArtistCarouselSection";
import InternetRadioSection from "@/components/home/sections/InternetRadioSection";
import NowPlayingSection from "@/components/home/sections/NowPlayingSection";
import PlaylistCarouselSection from "@/components/home/sections/PlaylistCarouselSection";
import PodcastCarouselSection from "@/components/home/sections/PodcastCarouselSection";
import RecentPlaysSection from "@/components/home/sections/RecentPlaysSection";
import {
  MostPlayedTracksSection,
  RandomSongsSection,
  SongsByGenreSection,
} from "@/components/home/sections/SongCarouselSection";
import StarredSection from "@/components/home/sections/StarredSection";
import { Box } from "@/components/ui/box";
import { useGenres } from "@/hooks/backend/useBrowsing";
import { useAlbumList2 } from "@/hooks/backend/useLists";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { getIsEffectivelyOnline } from "@/services/network";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { buildHomeFeed, type HomeSectionDescriptor } from "@/utils/homeFeed";
import { invalidateKeys } from "@/utils/invalidateKeys";

// A section counts as "seen" once half of it is on screen (not a 1px sliver).
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50 };
// Sections within this many slots below the last-seen one are enabled eagerly,
// so their data is ready before the user scrolls them into view.
const SECTION_LOOKAHEAD = 2;
// Index up to which sections are enabled on first mount: roughly what's above
// the fold, plus SECTION_LOOKAHEAD, so the first scroll has data waiting.
const INITIAL_ENABLED_INDEX = 4;
// After first paint, the tail of the feed is unlocked in small batches on an
// idle timer so scrolling never has to trigger loads — see the backfill effect.
const BACKFILL_BATCH = 2;
const BACKFILL_INTERVAL_MS = 350;
const BACKFILL_START_DELAY_MS = 800;

// Query-key prefixes backing the home feed sections, refetched on pull-to-refresh
// so the constant-key random rows (random songs/albums, most played) return new
// content. Dynamic genre/decade/artist rows change via a fresh sessionSeed.
const HOME_REFRESH_KEYS = [
  ["albumList2"],
  ["randomSongs"],
  ["mostPlayedSongs"],
  ["songsByGenre"],
  ["artists"],
  ["artist"],
  ["starred2"],
  ["playlists"],
  ["nowPlaying"],
  ["genres"],
] as const;

const keyExtractor = (item: HomeSectionDescriptor) => item.id;
const getItemType = (item: HomeSectionDescriptor) => item.kind;

export default function HomeScreen() {
  const { t } = useTranslation();
  const screenBottomPadding = useScreenBottomPadding();
  const capabilities = useCapabilities();
  const musicFolderId = useCurrentMusicFolderId();
  const hiddenHomeSections = useApp((store) => store.hiddenHomeSections);
  const queryClient = useQueryClient();
  const [sessionSeed, setSessionSeed] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    // Don't hit an unreachable server / dead network — bail so the spinner
    // retracts and the RQ cache is left untouched.
    if (!getIsEffectivelyOnline()) return;
    setRefreshing(true);
    // New seed reshuffles the dynamic picks (featured artists, genres, decade).
    setSessionSeed(Date.now());
    try {
      await invalidateKeys(queryClient, HOME_REFRESH_KEYS);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  // Eager seed data — drives the dynamic picks (featured artists / decades).
  const { data: recentlyPlayedData } = useAlbumList2({
    type: "recent",
    size: 12,
    musicFolderId,
  });
  const { data: newestData } = useAlbumList2({
    type: "newest",
    size: 12,
    musicFolderId,
  });
  const { data: frequentData } = useAlbumList2({
    type: "frequent",
    size: 12,
    musicFolderId,
  });
  const { data: genresData } = useGenres({ musicFolderId });

  const seedAlbums = useMemo<AlbumID3[]>(() => {
    const out: AlbumID3[] = [];
    const seen = new Set<string>();
    for (const a of [
      ...(recentlyPlayedData?.albumList2?.album ?? []),
      ...(frequentData?.albumList2?.album ?? []),
      ...(newestData?.albumList2?.album ?? []),
    ]) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
    return out;
  }, [
    recentlyPlayedData?.albumList2?.album,
    frequentData?.albumList2?.album,
    newestData?.albumList2?.album,
  ]);

  const sections = useMemo(
    () =>
      buildHomeFeed({
        seedAlbums,
        genres: genresData?.genres?.genre ?? [],
        capabilities,
        sessionSeed,
        hiddenSections: hiddenHomeSections,
      }),
    [
      seedAlbums,
      genresData?.genres?.genre,
      capabilities,
      sessionSeed,
      hiddenHomeSections,
    ],
  );

  // Sections read their gate from this store rather than from a prop computed
  // here, so scrolling doesn't change renderItem's identity — see
  // components/home/enabledSections.tsx. Scroll and the idle backfill both feed
  // the same monotonic counter, so whichever reaches a section first enables it.
  const [enabledSections] = useState(() =>
    createEnabledSectionsStore(INITIAL_ENABLED_INDEX),
  );

  const sectionCount = sections.length;
  useEffect(() => {
    if (enabledSections.getEnabledThrough() >= sectionCount - 1) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        const next = Math.min(
          enabledSections.getEnabledThrough() + BACKFILL_BATCH,
          sectionCount - 1,
        );
        enabledSections.advanceTo(next);
        if (next < sectionCount - 1) schedule(BACKFILL_INTERVAL_MS);
      }, delay);
    };
    schedule(BACKFILL_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sectionCount, enabledSections]);

  const handleViewableItemsChanged = useCallback(
    ({
      viewableItems,
    }: {
      viewableItems: ViewToken<HomeSectionDescriptor>[];
    }) => {
      let maxIndex = -1;
      for (const v of viewableItems) {
        if (typeof v.index === "number" && v.index > maxIndex) {
          maxIndex = v.index;
        }
      }
      if (maxIndex >= 0) {
        enabledSections.advanceTo(maxIndex + SECTION_LOOKAHEAD);
      }
    },
    [enabledSections],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: HomeSectionDescriptor; index: number }) => {
      switch (item.kind) {
        case "recentPlays":
          return <RecentPlaysSection />;
        case "nowPlaying":
          return <NowPlayingSection sectionIndex={index} />;
        case "albumList":
          return (
            <AlbumCarouselSection
              title={t(item.titleKey)}
              type={item.albumType}
              sectionIndex={index}
              seeAllHref={item.seeAllHref}
            />
          );
        case "albumsByGenre":
          return (
            <AlbumCarouselSection
              title={t("app.home.albumsByGenre", { genre: item.genre })}
              type="byGenre"
              genre={item.genre}
              sectionIndex={index}
            />
          );
        case "albumsByDecade":
          return (
            <AlbumCarouselSection
              title={t("app.home.albumsByDecade", { decade: item.decade })}
              type="byYear"
              fromYear={item.fromYear}
              toYear={item.toYear}
              sectionIndex={index}
            />
          );
        case "moreFromArtist":
          return (
            <ArtistAlbumsSection
              artistId={item.artistId}
              sectionIndex={index}
            />
          );
        case "songsByGenre":
          return (
            <SongsByGenreSection
              title={t("app.home.songsByGenre", { genre: item.genre })}
              genre={item.genre}
              sectionIndex={index}
            />
          );
        case "randomSongs":
          return (
            <RandomSongsSection
              title={t("app.home.randomSongs")}
              sectionIndex={index}
            />
          );
        case "mostPlayedTracks":
          return (
            <MostPlayedTracksSection
              title={t("app.home.mostPlayedTracks")}
              sectionIndex={index}
            />
          );
        case "randomArtists":
          return (
            <ArtistCarouselSection
              sectionIndex={index}
              shuffleSeed={sessionSeed}
            />
          );
        case "playlists":
          return (
            <PlaylistCarouselSection
              sectionIndex={index}
              shuffleSeed={sessionSeed}
            />
          );
        case "starred":
          return <StarredSection sectionIndex={index} />;
        case "podcasts":
          return <PodcastCarouselSection sectionIndex={index} />;
        case "internetRadio":
          return <InternetRadioSection sectionIndex={index} />;
      }
    },
    [t, sessionSeed],
  );

  const contentContainerStyle = useMemo(
    () => ({ paddingBottom: screenBottomPadding }),
    [screenBottomPadding],
  );

  return (
    <Box className="flex-1">
      <HomeTabsNav active="music" />
      <EnabledSectionsProvider store={enabledSections}>
        <FlashList
          data={sections}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          renderItem={renderItem}
          onViewableItemsChanged={handleViewableItemsChanged}
          viewabilityConfig={VIEWABILITY_CONFIG}
          drawDistance={500}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={contentContainerStyle}
        />
      </EnabledSectionsProvider>
    </Box>
  );
}
