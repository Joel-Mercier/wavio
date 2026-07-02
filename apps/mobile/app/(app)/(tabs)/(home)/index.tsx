import { FlashList, type ViewToken } from "@shopify/flash-list";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { useFloatingPlayerInset } from "@/hooks/useFloatingPlayerInset";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { buildHomeFeed, type HomeSectionDescriptor } from "@/utils/homeFeed";

// A section counts as "seen" once half of it is on screen (not a 1px sliver).
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50 };
// Sections within this many slots below the last-seen one are enabled eagerly,
// so their data is ready before the user scrolls them into view.
const SECTION_LOOKAHEAD = 2;
// Index up to which sections are enabled on first mount (above the fold).
const INITIAL_ENABLED_INDEX = 2;
// After first paint, the tail of the feed is unlocked in small batches on an
// idle timer so scrolling never has to trigger loads — see the backfill effect.
const BACKFILL_BATCH = 2;
const BACKFILL_INTERVAL_MS = 350;
const BACKFILL_START_DELAY_MS = 800;

export default function HomeScreen() {
  const { t } = useTranslation();
  const tabBarHeight = useBottomTabBarHeight();
  const floatingPlayerInset = useFloatingPlayerInset();
  const insets = useSafeAreaInsets();
  const capabilities = useCapabilities();
  const musicFolderId = useCurrentMusicFolderId();
  const [sessionSeed] = useState(() => Date.now());

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
  const { data: genresData } = useGenres();

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
      }),
    [seedAlbums, genresData?.genres?.genre, capabilities, sessionSeed],
  );

  const [lastSeenIndex, setLastSeenIndex] = useState(INITIAL_ENABLED_INDEX);
  const lastSeenIndexRef = useRef(INITIAL_ENABLED_INDEX);

  // Floor of enabled sections, advanced by the idle backfill independently of
  // scroll. Both this and lastSeenIndex only ever increase, so once a section
  // is enabled it stays enabled — the list never tears down loaded content.
  const [backfillIndex, setBackfillIndex] = useState(INITIAL_ENABLED_INDEX);
  const backfillRef = useRef(INITIAL_ENABLED_INDEX);

  const sectionCount = sections.length;
  useEffect(() => {
    if (backfillRef.current >= sectionCount - 1) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        const next = Math.min(
          backfillRef.current + BACKFILL_BATCH,
          sectionCount - 1,
        );
        backfillRef.current = next;
        setBackfillIndex(next);
        if (next < sectionCount - 1) schedule(BACKFILL_INTERVAL_MS);
      }, delay);
    };
    schedule(BACKFILL_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sectionCount]);

  const handleViewableItemsChanged = useCallback(
    ({
      viewableItems,
    }: {
      viewableItems: ViewToken<HomeSectionDescriptor>[];
    }) => {
      let maxIndex = lastSeenIndexRef.current;
      for (const v of viewableItems) {
        if (typeof v.index === "number" && v.index > maxIndex) {
          maxIndex = v.index;
        }
      }
      if (maxIndex !== lastSeenIndexRef.current) {
        lastSeenIndexRef.current = maxIndex;
        setLastSeenIndex(maxIndex);
      }
    },
    [],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: HomeSectionDescriptor; index: number }) => {
      // Enable a section once it's within the scroll lookahead window or has
      // been unlocked by the idle backfill, whichever reaches it first.
      const enabled =
        index <= Math.max(lastSeenIndex + SECTION_LOOKAHEAD, backfillIndex);
      switch (item.kind) {
        case "recentPlays":
          return <RecentPlaysSection />;
        case "nowPlaying":
          return <NowPlayingSection enabled={enabled} />;
        case "albumList":
          return (
            <AlbumCarouselSection
              title={t(item.titleKey)}
              type={item.albumType}
              enabled={enabled}
              seeAllHref={item.seeAllHref}
            />
          );
        case "albumsByGenre":
          return (
            <AlbumCarouselSection
              title={t("app.home.albumsByGenre", { genre: item.genre })}
              type="byGenre"
              genre={item.genre}
              enabled={enabled}
            />
          );
        case "albumsByDecade":
          return (
            <AlbumCarouselSection
              title={t("app.home.albumsByDecade", { decade: item.decade })}
              type="byYear"
              fromYear={item.fromYear}
              toYear={item.toYear}
              enabled={enabled}
            />
          );
        case "moreFromArtist":
          return (
            <ArtistAlbumsSection artistId={item.artistId} enabled={enabled} />
          );
        case "songsByGenre":
          return (
            <SongsByGenreSection
              title={t("app.home.songsByGenre", { genre: item.genre })}
              genre={item.genre}
              enabled={enabled}
            />
          );
        case "randomSongs":
          return (
            <RandomSongsSection
              title={t("app.home.randomSongs")}
              enabled={enabled}
            />
          );
        case "mostPlayedTracks":
          return (
            <MostPlayedTracksSection
              title={t("app.home.mostPlayedTracks")}
              enabled={enabled}
            />
          );
        case "randomArtists":
          return <ArtistCarouselSection enabled={enabled} />;
        case "playlists":
          return <PlaylistCarouselSection enabled={enabled} />;
        case "starred":
          return <StarredSection enabled={enabled} />;
        case "podcasts":
          return <PodcastCarouselSection enabled={enabled} />;
        case "internetRadio":
          return <InternetRadioSection enabled={enabled} />;
      }
    },
    [t, lastSeenIndex, backfillIndex],
  );

  return (
    <Box className="flex-1">
      <HomeTabsNav active="music" />
      <FlashList
        data={sections}
        keyExtractor={(item) => item.id}
        getItemType={(item) => item.kind}
        renderItem={renderItem}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        drawDistance={500}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: tabBarHeight + floatingPlayerInset + insets.bottom,
        }}
      />
    </Box>
  );
}
