import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import * as Sentry from "@sentry/react-native";
import { FlashList, type ViewToken } from "@shopify/flash-list";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import HomeTabsNav from "@/components/home/HomeTabsNav";
import AlbumCarouselSection from "@/components/home/sections/AlbumCarouselSection";
import ArtistAlbumsSection from "@/components/home/sections/ArtistAlbumsSection";
import InternetRadioSection from "@/components/home/sections/InternetRadioSection";
import RecentPlaysSection from "@/components/home/sections/RecentPlaysSection";
import {
  RandomSongsSection,
  SongsByGenreSection,
} from "@/components/home/sections/SongCarouselSection";
import StarredSection from "@/components/home/sections/StarredSection";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { useGenres } from "@/hooks/backend/useBrowsing";
import { useAlbumList2 } from "@/hooks/backend/useLists";
import { useCapabilities } from "@/hooks/useCapabilities";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { buildHomeFeed, type HomeSectionDescriptor } from "@/utils/homeFeed";

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 1 };

export default function HomeScreen() {
  const { t } = useTranslation();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const capabilities = useCapabilities();
  const musicFolderId = useCurrentMusicFolderId();
  const [sessionSeed, setSessionSeed] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);

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

  const [lastSeenIndex, setLastSeenIndex] = useState(2);
  const lastSeenIndexRef = useRef(2);

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

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setSessionSeed(Date.now());
    lastSeenIndexRef.current = 2;
    setLastSeenIndex(2);
    // FlashList doesn't itself fetch — we just reseed and let queries refresh
    // on next mount. Drop the spinner shortly.
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: HomeSectionDescriptor; index: number }) => {
      // Enable a section once the viewer is within one slot of it.
      const enabled = index <= lastSeenIndex + 1;
      switch (item.kind) {
        case "recentPlays":
          return <RecentPlaysSection />;
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
        case "starred":
          return <StarredSection enabled={enabled} />;
        case "internetRadio":
          return <InternetRadioSection enabled={enabled} />;
      }
    },
    [t, lastSeenIndex],
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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: tabBarHeight + FLOATING_PLAYER_HEIGHT + insets.bottom,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#fff"
          />
        }
      />
    </Box>
  );
}
