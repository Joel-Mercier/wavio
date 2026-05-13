import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import {
  type ReactElement,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AlbumListItem from "@/components/albums/AlbumListItem";
import AlbumListItemSkeleton from "@/components/albums/AlbumListItemSkeleton";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import HomeShortcut from "@/components/home/HomeShortcut";
import InternetRadioStationListItem from "@/components/internetRadioStations/InternetRadioStationListItem";
import InternetRadioStationListItemSkeleton from "@/components/internetRadioStations/InternetRadioStationListItemSkeleton";
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useArtist } from "@/hooks/openSubsonic/useBrowsing";
import { useGetInternetRadioStations } from "@/hooks/openSubsonic/useInternetRadioStations";
import { useAlbumList2 } from "@/hooks/openSubsonic/useLists";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import useAuth from "@/stores/auth";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import useRecentPlays from "@/stores/recentPlays";
import { loadingData } from "@/utils/loadingData";

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const setShowDrawer = useApp((store) => store.setShowDrawer);
  const username = useAuth((store) => store.username);
  const recentPlays = useRecentPlays((store) => store.recentPlays);
  const musicFolderId = useCurrentMusicFolderId();
  const {
    data: recentlyPlayedData,
    isLoading: isLoadingRecentlyPlayed,
    error: recentlyPlayedError,
  } = useAlbumList2({ type: "recent", size: 12, musicFolderId });
  const {
    data: recentData,
    isLoading: isLoadingRecent,
    error: recentError,
  } = useAlbumList2({ type: "newest", size: 12, musicFolderId });
  const [lazyEnabled, setLazyEnabled] = useState({
    mostPlayed: false,
    moreFromArtist: false,
    highestRated: false,
    random: false,
    internetRadioStations: false,
  });
  const sectionYRef = useRef<Partial<Record<keyof typeof lazyEnabled, number>>>(
    {},
  );
  const viewportHRef = useRef(0);
  const scrollYRef = useRef(0);

  const evaluateTriggers = useCallback(() => {
    const vh = viewportHRef.current;
    if (!vh) return;
    const threshold = scrollYRef.current + vh + vh; // generous: one full viewport of prefetch
    setLazyEnabled((prev) => {
      let next = prev;
      for (const key of Object.keys(prev) as (keyof typeof prev)[]) {
        if (prev[key]) continue;
        const y = sectionYRef.current[key];
        if (y !== undefined && y <= threshold) {
          if (next === prev) next = { ...prev };
          next[key] = true;
        }
      }
      return next;
    });
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollYRef.current = e.nativeEvent.contentOffset.y;
      viewportHRef.current = e.nativeEvent.layoutMeasurement.height;
      evaluateTriggers();
    },
    [evaluateTriggers],
  );

  const handleScrollViewLayout = useCallback(
    (e: LayoutChangeEvent) => {
      viewportHRef.current = e.nativeEvent.layout.height;
      evaluateTriggers();
    },
    [evaluateTriggers],
  );

  const makeSectionOnLayout = useCallback(
    (key: keyof typeof lazyEnabled) => (e: LayoutChangeEvent) => {
      sectionYRef.current[key] = e.nativeEvent.layout.y;
      evaluateTriggers();
    },
    [evaluateTriggers],
  );

  const {
    data: mostPlayedData,
    isLoading: isLoadingMostPlayed,
    error: mostPlayedError,
  } = useAlbumList2(
    { type: "frequent", size: 12, musicFolderId },
    { enabled: lazyEnabled.mostPlayed },
  );
  const {
    data: highestRatedData,
    isLoading: isLoadingHighestRated,
    error: highestRatedError,
  } = useAlbumList2(
    { type: "highest", size: 12, musicFolderId },
    { enabled: lazyEnabled.highestRated },
  );
  const {
    data: randomData,
    isLoading: isLoadingRandom,
    error: randomError,
  } = useAlbumList2(
    { type: "random", size: 12, musicFolderId },
    { enabled: lazyEnabled.random },
  );
  const moreFromArtistId = useMemo(() => {
    const pickRandom = (albums?: AlbumID3[]) => {
      const candidates = (albums ?? []).filter((album) => !!album.artistId);
      if (!candidates.length) return undefined;
      return candidates[Math.floor(Math.random() * candidates.length)].artistId;
    };
    return (
      pickRandom(recentlyPlayedData?.albumList2?.album) ??
      pickRandom(mostPlayedData?.albumList2?.album) ??
      pickRandom(recentData?.albumList2?.album)
    );
  }, [
    recentlyPlayedData?.albumList2?.album,
    mostPlayedData?.albumList2?.album,
    recentData?.albumList2?.album,
  ]);
  const {
    data: moreFromArtistData,
    isLoading: isLoadingMoreFromArtist,
    error: moreFromArtistError,
  } = useArtist(
    lazyEnabled.moreFromArtist && moreFromArtistId ? moreFromArtistId : "",
  );
  const {
    data: internetRadioStationsData,
    isLoading: isLoadingInternetRadioStations,
    error: internetRadioStationsError,
  } = useGetInternetRadioStations({
    enabled: lazyEnabled.internetRadioStations,
  });
  return (
    <Box>
      <HStack
        className="px-6 gap-x-4 my-6 items-center"
        style={{ paddingTop: insets.top }}
      >
        <FadeOutScaleDown onPress={() => setShowDrawer(true)}>
          <Avatar className="border-emerald-500 border-2 w-10 h-10">
            <AvatarFallbackText className="font-body ">
              {username}
            </AvatarFallbackText>
          </Avatar>
        </FadeOutScaleDown>
        <HStack className="items-center">
          <FadeOutScaleDown
            onPress={() => router.navigate("/(app)/(tabs)/(home)")}
          >
            <Badge className="rounded-full bg-emerald-500 text-primary-800 px-4 py-1 mr-2">
              <BadgeText className="normal-case text-md text-white">
                {t("app.home.tabs.music")}
              </BadgeText>
            </Badge>
          </FadeOutScaleDown>
          <FadeOutScaleDown
            onPress={() => router.navigate("/(app)/(tabs)/(home)/podcasts")}
          >
            <Badge className="rounded-full bg-gray-800 px-4 py-1 mr-2">
              <BadgeText className="normal-case text-md text-white">
                {t("app.home.tabs.podcasts")}
              </BadgeText>
            </Badge>
          </FadeOutScaleDown>
        </HStack>
      </HStack>
      <ScrollView
        contentContainerStyle={{
          paddingBottom:
            tabBarHeight + FLOATING_PLAYER_HEIGHT + insets.bottom * 2 + 16,
        }}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        onLayout={handleScrollViewLayout}
        scrollEventThrottle={64}
      >
        <Box className="px-6 mb-4">
          <VStack className="gap-y-4">
            {recentPlays.reduce((rows: ReactElement[], play, index) => {
              if (index % 2 === 0) {
                rows.push(
                  <HStack key={`row-${play.id}`} className="gap-x-4">
                    <HomeShortcut key={play.id} recentPlay={play} />
                    {recentPlays[index + 1] && (
                      <HomeShortcut
                        key={recentPlays[index + 1].id}
                        recentPlay={recentPlays[index + 1]}
                      />
                    )}
                  </HStack>,
                );
              }
              return rows;
            }, [])}
          </VStack>
        </Box>
        <Box className="px-6 mt-4 mb-4">
          <HStack className="items-center justify-between">
            <Heading size="xl" className="text-white">
              {t("app.home.recentlyPlayed")}
            </Heading>
            {!!recentlyPlayedData?.albumList2?.album?.length && (
              <FadeOutScaleDown
                href={{
                  pathname: "/(app)/(tabs)/(home)/recently-played",
                  params: { type: "recent" },
                }}
              >
                <Text className="text-primary-100">
                  {t("app.shared.seeAll")}
                </Text>
              </FadeOutScaleDown>
            )}
          </HStack>
        </Box>
        {recentlyPlayedError ? (
          <ErrorDisplay error={recentlyPlayedError} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="mb-6 pl-6"
          >
            {isLoadingRecentlyPlayed
              ? loadingData(4).map((_, index) => (
                  <AlbumListItemSkeleton
                    key={`recently-played-${
                      // biome-ignore lint/suspicious/noArrayIndexKey: <>
                      index
                    }`}
                    index={index}
                    layout="horizontal"
                  />
                ))
              : recentlyPlayedData?.albumList2?.album?.map((album, index) => (
                  <AlbumListItem
                    key={album.id}
                    album={album}
                    index={index}
                    layout="horizontal"
                  />
                ))}
          </ScrollView>
        )}
        {!isLoadingRecentlyPlayed &&
          !recentlyPlayedError &&
          !recentlyPlayedData?.albumList2?.album?.length && <EmptyDisplay />}
        <Box className="px-6 mt-4 mb-4">
          <HStack className="items-center justify-between">
            <Heading size="xl" className="text-white">
              {t("app.home.recentlyAdded")}
            </Heading>
            {!!recentData?.albumList2?.album?.length && (
              <FadeOutScaleDown
                href={{
                  pathname: "/(app)/(tabs)/(home)/recently-added",
                  params: { type: "newest" },
                }}
              >
                <Text className="text-primary-100">
                  {t("app.shared.seeAll")}
                </Text>
              </FadeOutScaleDown>
            )}
          </HStack>
        </Box>
        {recentError ? (
          <ErrorDisplay error={recentError} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="pl-6 mb-6"
          >
            {isLoadingRecent
              ? loadingData(4).map((_, index) => (
                  <AlbumListItemSkeleton
                    key={`recently-added-${
                      // biome-ignore lint/suspicious/noArrayIndexKey: <>
                      index
                    }`}
                    index={index}
                    layout="horizontal"
                  />
                ))
              : recentData?.albumList2?.album?.map((album, index) => (
                  <AlbumListItem
                    key={album.id}
                    album={album}
                    index={index}
                    layout="horizontal"
                  />
                ))}
          </ScrollView>
        )}
        {!isLoadingRecent &&
          !recentError &&
          !recentData?.albumList2?.album?.length && <EmptyDisplay />}
        <Box onLayout={makeSectionOnLayout("mostPlayed")}>
          <Box className="px-6 mt-4 mb-4">
            <HStack className="items-center justify-between">
              <Heading size="xl" className="text-white">
                {t("app.home.mostPlayed")}
              </Heading>
              {!!mostPlayedData?.albumList2?.album?.length && (
                <FadeOutScaleDown
                  href={{
                    pathname: "/(app)/(tabs)/(home)/most-played",
                    params: { type: "frequent" },
                  }}
                >
                  <Text className="text-primary-100">
                    {t("app.shared.seeAll")}
                  </Text>
                </FadeOutScaleDown>
              )}
            </HStack>
          </Box>
          {mostPlayedError ? (
            <ErrorDisplay error={mostPlayedError} />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="pl-6 mb-6"
            >
              {!lazyEnabled.mostPlayed || isLoadingMostPlayed
                ? loadingData(4).map((_, index) => (
                    <AlbumListItemSkeleton
                      key={`most-played-${
                        // biome-ignore lint/suspicious/noArrayIndexKey: <>
                        index
                      }`}
                      index={index}
                      layout="horizontal"
                    />
                  ))
                : mostPlayedData?.albumList2?.album?.map((album, index) => (
                    <AlbumListItem
                      key={album.id}
                      album={album}
                      index={index}
                      layout="horizontal"
                    />
                  ))}
            </ScrollView>
          )}
          {lazyEnabled.mostPlayed &&
            !isLoadingMostPlayed &&
            !mostPlayedError &&
            !mostPlayedData?.albumList2?.album?.length && <EmptyDisplay />}
        </Box>
        {moreFromArtistId && (
          <Box onLayout={makeSectionOnLayout("moreFromArtist")}>
            <Box className="px-6 mt-4 mb-4">
              <HStack className="items-center justify-between">
                <Heading size="xl" className="text-white">
                  {t("app.albums.moreFromArtist", {
                    artist: moreFromArtistData?.artist?.name ?? "",
                  })}
                </Heading>

                {!!moreFromArtistData?.artist?.album?.length && (
                  <FadeOutScaleDown
                    href={{
                      pathname: "/artists/[id]",
                      params: { id: moreFromArtistData?.artist?.id },
                    }}
                  >
                    <Text className="text-primary-100">
                      {t("app.shared.seeAll")}
                    </Text>
                  </FadeOutScaleDown>
                )}
              </HStack>
            </Box>
            {moreFromArtistError ? (
              <ErrorDisplay error={moreFromArtistError} />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="pl-6 mb-6"
              >
                {!lazyEnabled.moreFromArtist || isLoadingMoreFromArtist
                  ? loadingData(4).map((_, index) => (
                      <AlbumListItemSkeleton
                        key={`more-from-artist-${
                          // biome-ignore lint/suspicious/noArrayIndexKey: <>
                          index
                        }`}
                        index={index}
                        layout="horizontal"
                      />
                    ))
                  : moreFromArtistData?.artist?.album?.map((album, index) => (
                      <AlbumListItem
                        key={album.id}
                        album={album}
                        index={index}
                        layout="horizontal"
                      />
                    ))}
              </ScrollView>
            )}
          </Box>
        )}
        <Box onLayout={makeSectionOnLayout("highestRated")}>
          <Box className="px-6 mt-4 mb-4">
            <HStack className="items-center justify-between">
              <Heading size="xl" className="text-white">
                {t("app.home.topRated")}
              </Heading>
              {!!highestRatedData?.albumList2?.album?.length && (
                <FadeOutScaleDown
                  href={{
                    pathname: "/(app)/(tabs)/(home)/highest-rated",
                    params: { type: "highest" },
                  }}
                >
                  <Text className="text-primary-100">
                    {t("app.shared.seeAll")}
                  </Text>
                </FadeOutScaleDown>
              )}
            </HStack>
          </Box>
          {highestRatedError ? (
            <ErrorDisplay error={highestRatedError} />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="pl-6 mb-6"
            >
              {!lazyEnabled.highestRated || isLoadingHighestRated
                ? loadingData(4).map((_, index) => (
                    <AlbumListItemSkeleton
                      key={`highest-rated-${
                        // biome-ignore lint/suspicious/noArrayIndexKey: <>
                        index
                      }`}
                      index={index}
                      layout="horizontal"
                    />
                  ))
                : highestRatedData?.albumList2?.album?.map((album, index) => (
                    <AlbumListItem
                      key={album.id}
                      album={album}
                      index={index}
                      layout="horizontal"
                    />
                  ))}
            </ScrollView>
          )}
          {lazyEnabled.highestRated &&
            !isLoadingHighestRated &&
            !highestRatedError &&
            !highestRatedData?.albumList2?.album?.length && <EmptyDisplay />}
        </Box>
        <Box onLayout={makeSectionOnLayout("random")}>
          <Box className="px-6 mt-4 mb-4">
            <HStack className="items-center justify-between">
              <Heading size="xl" className="text-white">
                {t("app.home.random")}
              </Heading>
              {!!randomData?.albumList2?.album?.length && (
                <FadeOutScaleDown
                  href={{
                    pathname: "/(app)/(tabs)/(home)/random",
                    params: { type: "random" },
                  }}
                >
                  <Text className="text-primary-100">
                    {t("app.shared.seeAll")}
                  </Text>
                </FadeOutScaleDown>
              )}
            </HStack>
          </Box>
          {randomError ? (
            <ErrorDisplay error={randomError} />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="pl-6 mb-6"
            >
              {!lazyEnabled.random || isLoadingRandom
                ? loadingData(4).map((_, index) => (
                    <AlbumListItemSkeleton
                      key={`random-${
                        // biome-ignore lint/suspicious/noArrayIndexKey: <>
                        index
                      }`}
                      index={index}
                      layout="horizontal"
                    />
                  ))
                : randomData?.albumList2?.album?.map((album, index) => (
                    <AlbumListItem
                      key={album.id}
                      album={album}
                      index={index}
                      layout="horizontal"
                    />
                  ))}
            </ScrollView>
          )}
          {lazyEnabled.random &&
            !isLoadingRandom &&
            !randomError &&
            !randomData?.albumList2?.album?.length && <EmptyDisplay />}
        </Box>
        <Box onLayout={makeSectionOnLayout("internetRadioStations")}>
          <HStack className="px-6 mt-4 mb-4 items-center justify-between">
            <Heading size="xl" className="text-white">
              {t("app.home.internetRadioStations")}
            </Heading>
            {!!internetRadioStationsData?.internetRadioStations
              ?.internetRadioStation?.length && (
              <FadeOutScaleDown href="/(app)/(tabs)/(home)/internet-radio-stations">
                <Text className="text-primary-100">
                  {t("app.shared.seeAll")}
                </Text>
              </FadeOutScaleDown>
            )}
          </HStack>
          {internetRadioStationsError ? (
            <ErrorDisplay error={internetRadioStationsError} />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="pl-6 mb-6"
            >
              {!lazyEnabled.internetRadioStations ||
              isLoadingInternetRadioStations
                ? loadingData(4).map((_, index) => (
                    <InternetRadioStationListItemSkeleton
                      key={`internet-radio-stations-${
                        // biome-ignore lint/suspicious/noArrayIndexKey: <>
                        index
                      }`}
                    />
                  ))
                : internetRadioStationsData?.internetRadioStations?.internetRadioStation
                    ?.slice(0, 12)
                    .map((radioStation) => (
                      <InternetRadioStationListItem
                        key={radioStation.id}
                        internetRadioStation={radioStation}
                      />
                    ))}
            </ScrollView>
          )}
          {lazyEnabled.internetRadioStations &&
            !isLoadingInternetRadioStations &&
            !internetRadioStationsError &&
            !internetRadioStationsData?.internetRadioStations
              ?.internetRadioStation?.length && <EmptyDisplay />}
        </Box>
      </ScrollView>
    </Box>
  );
}
