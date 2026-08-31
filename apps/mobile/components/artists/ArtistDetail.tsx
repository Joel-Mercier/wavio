import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import ChevronRight from "lucide-react-native/dist/esm/icons/chevron-right.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Heart from "lucide-react-native/dist/esm/icons/heart.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import Star from "lucide-react-native/dist/esm/icons/star.mjs";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, ScrollView } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import LastFM from "@/assets/images/lastfm.svg";
import MusicBrainz from "@/assets/images/musicbrainz.svg";
import AnimatedHeart from "@/components/AnimatedHeart";
import AlbumListItem from "@/components/albums/AlbumListItem";
import AlbumListItemSkeleton from "@/components/albums/AlbumListItemSkeleton";
import ArtistCarouselRow from "@/components/artists/ArtistCarouselRow";
import AudioMuseSimilarArtists from "@/components/artists/AudioMuseSimilarArtists";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import PlayPauseButton from "@/components/PlayPauseButton";
import RatingModal from "@/components/RatingModal";
import RichText from "@/components/RichText";
import ShuffleToggle from "@/components/ShuffleToggle";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { ImageBackground } from "@/components/ui/image-background";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import {
  useArtist,
  useArtistAppearances,
  useArtistInfo2,
  useTopSongs,
} from "@/hooks/backend/useBrowsing";
import { useStarred2 } from "@/hooks/backend/useLists";
import {
  useSetRating,
  useStar,
  useUnstar,
} from "@/hooks/backend/useMediaAnnotation";
import { useHasPlayableTracks, useOfflineArtist } from "@/hooks/offline";
import { useIsPlaying } from "@/hooks/player";
import { useCapabilities } from "@/hooks/useCapabilities";
import useImageColors from "@/hooks/useImageColors";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useRefreshRecentPlay } from "@/hooks/useRefreshRecentPlay";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import { SIMILAR_ARTISTS_DEFAULT_RESULTS } from "@/services/audioMuse/artists";
import { getAlbum } from "@/services/backend/browsing";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import useApp from "@/stores/app";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import useQueue, { type QueueSource } from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";
import { loadingData } from "@/utils/loadingData";
import { logError } from "@/utils/log";
import { goBackOrHome } from "@/utils/navigation";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;
const AnimatedBox = Animated.createAnimatedComponent(Box);

// Both similar-artist rows cap alike, so the backend one borrows AudioMuse's
// count rather than keeping a second number in sync by hand. It doubles as the
// getArtistInfo2 `count` param, which is what decides how many the server sends.
const SIMILAR_ARTISTS_LIMIT = SIMILAR_ARTISTS_DEFAULT_RESULTS;

export default function ArtistDetail() {
  const [black, white, emerald500, gray200] = Uniwind.getCSSVariable([
    "--color-black",
    "--color-white",
    "--color-emerald-500",
    "--color-gray-200",
  ]) as string[];
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [showRatingModal, setShowRatingModal] = useState<boolean>(false);
  const [topSongsExpanded, setTopSongsExpanded] = useState<boolean>(false);
  const [topSongsContentHeight, setTopSongsContentHeight] = useState<number>(0);
  const TOP_SONGS_COLLAPSED_HEIGHT = 450;
  const isWideLayout = useApp((s) => s.isWideLayout);
  const topSongsHeight = useSharedValue<number>(TOP_SONGS_COLLAPSED_HEIGHT);
  const topSongsOverlayOpacity = useSharedValue<number>(1);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { data: serverData, isLoading, error } = useArtist(id);
  // Offline (or before the server query resolves) fall back to the artist
  // derived from downloaded album collections so extended-offline libraries
  // keep their artist screens without a cached server response; only derived
  // while server data is absent.
  const offlineArtistData = useOfflineArtist(id, serverData == null);
  const data = serverData ?? offlineArtistData;
  // A rename or new cover on the server reaches the home shortcut from here.
  useRefreshRecentPlay(
    serverData?.artist
      ? {
          id,
          type: "artist",
          title: serverData.artist.name,
          coverArt: serverData.artist.coverArt,
        }
      : undefined,
  );
  // `includeNotPresent` keeps the recommendations the library doesn't hold:
  // they're the discovery half of the row, and ArtistCarouselRow renders them
  // as their own kind of tile rather than a link to a detail screen.
  const { data: artistInfoData, isLoading: isLoadingArtistInfo } =
    useArtistInfo2(id, {
      count: SIMILAR_ARTISTS_LIMIT,
      includeNotPresent: true,
    });
  // Passing the route id lets servers with the `topSongsByArtistId` extension
  // (and Jellyfin / the local library) fetch this in parallel with useArtist
  // instead of waiting on it for a name.
  const {
    data: topSongs,
    isLoading: isLoadingTopSongs,
    error: topSongsError,
  } = useTopSongs(data?.artist?.name ?? "", { count: 10, id });
  const musicFolderId = useCurrentMusicFolderId();
  // Summed from the discography rather than fetched: the all-songs list itself
  // costs one request per album, which the artist screen shouldn't pay just to
  // label a link.
  const albums = useMemo(() => data?.artist?.album ?? [], [data?.artist]);
  const allSongsCount = useMemo(
    () => albums.reduce((total, album) => total + (album.songCount ?? 0), 0),
    [albums],
  );
  const { data: appearancesData } = useArtistAppearances(id, {
    name: data?.artist?.name,
    musicFolderId,
  });
  const appearsOnAlbums: AlbumID3[] =
    appearancesData?.artistAppearances?.album ?? [];
  const { data: starredData } = useStarred2({ musicFolderId });
  const likedSongs =
    starredData?.starred2?.song?.filter((song) => song.artistId === id) ?? [];
  const likedAlbums =
    starredData?.starred2?.album?.filter((album) => album.artistId === id) ??
    [];
  const doFavorite = useStar();
  const doUnfavorite = useUnstar();
  const doSetRating = useSetRating();
  const capabilities = useCapabilities();
  const isOnline = useIsOnline();
  const addRecentPlay = useRecentPlays((store) => store.addRecentPlay);
  const colors = useImageColors(artworkUrl(data?.artist?.coverArt));
  const topColor =
    (colors?.platform === "ios"
      ? colors.primary
      : colors?.muted === black
        ? colors?.darkVibrant
        : colors?.muted) || black;
  const offsetY = useSharedValue(0);
  const headerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      offsetY.value,
      [0, 204],
      [0, 1],
      Extrapolation.CLAMP,
    );
    // While the bar is (near-)invisible it must not intercept touches, else it
    // sits on top of the static back button in the list header and swallows it.
    return {
      opacity,
      pointerEvents: opacity > 0.5 ? "auto" : "none",
    };
  });
  const headerImageHeight = isWideLayout ? 224 : 384;
  const scrollHandler = useAnimatedScrollHandler((event) => {
    offsetY.value = event.contentOffset.y;
  });

  const topSongsAnimatedStyle = useAnimatedStyle(() => ({
    height: topSongsHeight.value,
  }));
  const topSongsOverlayStyle = useAnimatedStyle(() => ({
    opacity: topSongsOverlayOpacity.value,
  }));
  const topSongsSeeLessStyle = useAnimatedStyle(() => ({
    opacity: 1 - topSongsOverlayOpacity.value,
  }));

  const handleToggleTopSongs = () => {
    const next = !topSongsExpanded;
    const target = next ? topSongsContentHeight : TOP_SONGS_COLLAPSED_HEIGHT;
    const timing = { duration: 250, easing: Easing.out(Easing.cubic) };
    topSongsHeight.value = withTiming(target, timing);
    topSongsOverlayOpacity.value = withTiming(next ? 0 : 1, timing);
    setTopSongsExpanded(next);
  };

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleFavoritePress = () => {
    if (!data?.artist?.id) return;
    const artistId = data.artist.id;
    queryClient.setQueryData(["artist", id], {
      ...data,
      artist: {
        ...data?.artist,
        starred: new Date().toISOString(),
      },
    });
    doFavorite.mutate(
      { id: artistId, artistId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["starred2"] });
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.artists.favoriteSuccessMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
        onError: (error) => {
          queryClient.setQueryData(["artist", id], {
            ...data,
            artist: {
              ...data?.artist,
              starred: undefined,
            },
          });
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.artists.favoriteErrorMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const handleUnfavoritePress = () => {
    if (!data?.artist?.id) return;
    const artistId = data.artist.id;
    queryClient.setQueryData(["artist", id], {
      ...data,
      artist: {
        ...data?.artist,
        starred: undefined,
      },
    });
    doUnfavorite.mutate(
      { id: artistId, artistId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["starred2"] });
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.artists.unfavoriteSuccessMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
        onError: (error) => {
          queryClient.setQueryData(["artist", id], {
            ...data,
            artist: {
              ...data?.artist,
              starred: new Date().toISOString(),
            },
          });
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.artists.unfavoriteErrorMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const isPlaying = useIsPlaying();
  const queueSource = useQueue((store) => store.source);
  const isActiveSource =
    queueSource?.type === "artist" && queueSource.id === id;
  const artistSource = useMemo<QueueSource>(
    () =>
      data?.artist
        ? {
            type: "artist",
            name: data.artist.name,
            id: data.artist.id,
            coverArt: data.artist.coverArt,
          }
        : null,
    [data?.artist],
  );
  const handleTopSongPress = useTrackListPress(topSongs, artistSource);
  const firstAlbumId = data?.artist?.album?.[0]?.id;
  // The play button falls back to the artist's first album when there are no top
  // songs. Offline that album's detail can only come from the persisted cache —
  // fetchQuery would hang on a paused fetch once the entry is stale — so read it
  // synchronously here, both to gate the button and to play from.
  const cachedFirstAlbumSongs = useMemo(
    () =>
      firstAlbumId
        ? queryClient.getQueryData<Awaited<ReturnType<typeof getAlbum>>>([
            "album",
            firstAlbumId,
          ])?.album?.song
        : undefined,
    [queryClient, firstAlbumId],
  );
  const hasPlayableTracks = useHasPlayableTracks(
    topSongs && topSongs.length > 0 ? topSongs : cachedFirstAlbumSongs,
  );
  const handlePlayPress = async () => {
    if (isActiveSource) {
      togglePlayPause();
      return;
    }
    if (topSongs && topSongs.length > 0) {
      playTracks(topSongs.map(childToTrack), 0, {
        shuffleFromRandom: true,
        source: artistSource,
      });
    } else {
      if (!firstAlbumId) return;
      let songs = cachedFirstAlbumSongs;
      if (!songs || songs.length === 0) {
        if (!isOnline) return;
        try {
          const albumData = await queryClient.fetchQuery({
            queryKey: ["album", firstAlbumId],
            queryFn: () => getAlbum(firstAlbumId),
          });
          songs = albumData?.album?.song;
        } catch (e) {
          logError(e);
          return;
        }
      }
      if (!songs || songs.length === 0) return;
      playTracks(songs.map(childToTrack), 0, {
        shuffleFromRandom: true,
        source: artistSource,
      });
    }
    if (data?.artist) {
      addRecentPlay({
        id,
        title: data.artist.name,
        type: "artist",
        coverArt: data.artist.coverArt,
      });
    }
  };

  const shuffle = useQueue((store) => store.shuffle);
  const setShuffle = useQueue((store) => store.setShuffle);
  const handleShufflePress = () => {
    setShuffle(!shuffle);
  };

  const handleTrackPressCallback = () => {
    if (data?.artist) {
      addRecentPlay({
        id,
        title: data?.artist.name,
        type: "artist",
        coverArt: data?.artist?.coverArt,
      });
    }
  };

  const handleMusicBrainzPress = async () => {
    bottomSheetModalRef.current?.dismiss();
    if (
      data?.artist?.musicBrainzId &&
      (await Linking.canOpenURL(
        `https://musicbrainz.org/artist/${data?.artist?.musicBrainzId}`,
      ))
    ) {
      Linking.openURL(
        `https://musicbrainz.org/artist/${data?.artist?.musicBrainzId}`,
      );
    }
  };

  const handleLastFMPress = async () => {
    if (
      data?.artist?.name &&
      (await Linking.canOpenURL(
        `https://www.last.fm/music/${encodeURIComponent(data?.artist?.name)}`,
      ))
    ) {
      Linking.openURL(
        `https://www.last.fm/music/${encodeURIComponent(data?.artist?.name)}`,
      );
    }
  };

  const handleRatingPress = () => {
    bottomSheetModalRef.current?.dismiss();
    setShowRatingModal(true);
  };

  const handleCloseRatingModal = () => setShowRatingModal(false);

  const handleRatingChange = (rating: number) => {
    if (!data?.artist?.id) return;
    doSetRating.mutate(
      { id: data.artist.id, rating },
      {
        onSuccess: () => {
          setShowRatingModal(false);
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.shared.rateSuccessMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
        onError: (error) => {
          logError(error);
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.shared.rateErrorMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  return (
    <Box className="h-full bg-black">
      <AnimatedBox
        className="w-full z-10 absolute top-0 left-0 right-0"
        style={[headerStyle]}
      >
        <LinearGradient colors={[topColor, black]}>
          <HStack
            className="items-center justify-between pb-4 px-6 bg-black/25"
            style={{ paddingTop: insets.top + (isWideLayout ? 0 : 16) }}
          >
            <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
              <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                <ArrowLeft size={24} color={white} />
              </Box>
            </FadeOutScaleDown>
            <Heading
              numberOfLines={1}
              className="text-white text-center font-bold truncate flex-1"
              size="lg"
            >
              {data?.artist?.name}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </AnimatedBox>
      <ImageBackground
        source={{ uri: artworkUrl(data?.artist?.coverArt) }}
        alt="Artist cover"
        className="absolute top-0 left-0 right-0"
        style={{ height: headerImageHeight }}
        contentFit="cover"
      />

      <AnimatedFlashList
        onScroll={scrollHandler}
        data={isLoading ? loadingData(3) : albums.slice(0, 3)}
        renderItem={({ item, index }: { item: AlbumID3; index: number }) =>
          isLoading ? (
            <Box className="bg-black">
              <AlbumListItemSkeleton index={index} />
            </Box>
          ) : (
            <Box className="bg-black">
              <AlbumListItem album={item} index={index} />
            </Box>
          )
        }
        keyExtractor={(item: AlbumID3) => item.id}
        ListHeaderComponent={
          <>
            <LinearGradient
              colors={["transparent", black]}
              locations={[0, 0.9]}
              style={{ height: headerImageHeight }}
            >
              <Box className="flex-1 " style={{ paddingTop: insets.top }}>
                <VStack className="mt-6 px-6 items-start justify-between h-full">
                  <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
                    <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                      <ArrowLeft size={24} color={white} />
                    </Box>
                  </FadeOutScaleDown>
                  <Heading
                    numberOfLines={2}
                    className="text-white mb-4 absolute bottom-2 left-6"
                    size="3xl"
                  >
                    {data?.artist?.name}
                  </Heading>
                </VStack>
              </Box>
            </LinearGradient>
            <VStack className="px-6 bg-black">
              <HStack className="items-center justify-between my-4">
                <HStack className="items-center gap-x-4">
                  <AnimatedHeart
                    filled={!!data?.artist?.starred}
                    onPress={
                      data?.artist?.starred
                        ? handleUnfavoritePress
                        : handleFavoritePress
                    }
                  />
                  <FadeOutScaleDown onPress={handlePresentModalPress}>
                    <EllipsisVertical color={white} />
                  </FadeOutScaleDown>
                </HStack>
                <HStack className="items-center gap-x-4">
                  <ShuffleToggle
                    active={shuffle}
                    onPress={handleShufflePress}
                  />
                  <PlayPauseButton
                    isPlaying={isActiveSource && isPlaying}
                    onPress={handlePlayPress}
                    size={48}
                    iconSize={24}
                    color={white}
                    className="bg-emerald-500"
                    disabled={!isActiveSource && !hasPlayableTracks}
                  />
                </HStack>
              </HStack>
              {(likedSongs.length > 0 || likedAlbums.length > 0) && (
                <FadeOutScaleDown
                  href={{
                    pathname: "/artists/[id]/liked-songs",
                    params: { id },
                  }}
                >
                  <HStack className="items-center mb-6">
                    <Box className="relative">
                      <Image
                        source={{ uri: artworkUrl(data?.artist?.coverArt) }}
                        alt="Liked songs cover"
                        className="w-16 h-16 rounded-full aspect-square"
                      />
                      <Box className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-black items-center justify-center">
                        <Heart size={14} color={emerald500} fill={emerald500} />
                      </Box>
                    </Box>
                    <VStack className="ml-4 flex-1">
                      <Heading
                        className="text-white"
                        size="md"
                        numberOfLines={1}
                      >
                        {t("app.artists.likedSongs")}
                      </Heading>
                      <Text className="text-primary-100" numberOfLines={1}>
                        {t("app.shared.songCount", {
                          count: likedSongs.length,
                        })}
                        {likedAlbums.length > 0 && (
                          <>
                            {" • "}
                            {t("app.shared.albumCount", {
                              count: likedAlbums.length,
                            })}
                          </>
                        )}
                        {" • "}
                        {data?.artist?.name}
                      </Text>
                    </VStack>
                    <ChevronRight color={white} />
                  </HStack>
                </FadeOutScaleDown>
              )}
              <Heading className="text-white">
                {t("app.artists.topSongs")}
              </Heading>
              <AnimatedBox
                className="overflow-hidden mb-4"
                style={
                  (topSongs?.length || 0) > 5 || isLoadingTopSongs
                    ? topSongsAnimatedStyle
                    : undefined
                }
              >
                <Box
                  onLayout={(e) => {
                    const h = e.nativeEvent.layout.height;
                    if (h && h !== topSongsContentHeight) {
                      setTopSongsContentHeight(h);
                      // Keep the animated height in sync if content is
                      // re-measured while expanded (e.g. artwork loads in),
                      // otherwise the stale height would clip the content.
                      if (topSongsExpanded) {
                        topSongsHeight.value = h;
                      }
                    }
                  }}
                >
                  {topSongsError && <ErrorDisplay error={topSongsError} />}
                  {isLoadingTopSongs ? (
                    loadingData(6).map((_, index) => (
                      <TrackListItemSkeleton
                        key={`top-song-skeleton-${
                          // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                          index
                        }`}
                        index={index}
                        className="px-6"
                      />
                    ))
                  ) : (
                    <>
                      {topSongs?.map((song, index) => (
                        <TrackListItem
                          key={song.id}
                          showIndex
                          track={song}
                          index={index}
                          onPress={handleTopSongPress}
                          onPlayCallback={handleTrackPressCallback}
                          disableSwipe
                        />
                      ))}
                    </>
                  )}

                  {!isLoadingTopSongs &&
                    !topSongsError &&
                    !topSongs?.length && <EmptyDisplay />}

                  {(topSongs?.length || 0) > 5 && (
                    <Animated.View
                      pointerEvents={topSongsExpanded ? "auto" : "none"}
                      style={topSongsSeeLessStyle}
                    >
                      <Center className="pt-6 pb-2">
                        <FadeOutScaleDown
                          onPress={handleToggleTopSongs}
                          className="rounded-full border border-gray-300 py-1 px-3"
                        >
                          <Text className="text-gray-300">
                            {t("app.shared.seeLess")}
                          </Text>
                        </FadeOutScaleDown>
                      </Center>
                    </Animated.View>
                  )}
                </Box>
                {(topSongs?.length || 0) > 5 && (
                  <Animated.View
                    pointerEvents={topSongsExpanded ? "none" : "auto"}
                    style={[
                      {
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                      },
                      topSongsOverlayStyle,
                    ]}
                  >
                    <LinearGradient
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 110,
                      }}
                      colors={["transparent", "rgba(0, 0, 0, 0.85)", black]}
                      locations={[0, 0.4, 0.65]}
                    />
                    <Center>
                      <FadeOutScaleDown
                        onPress={handleToggleTopSongs}
                        className="rounded-full border border-gray-300 py-1 px-3"
                      >
                        <Text className="text-gray-300">
                          {t("app.shared.seeMore")}
                        </Text>
                      </FadeOutScaleDown>
                    </Center>
                  </Animated.View>
                )}
              </AnimatedBox>
              <Heading className="text-white mb-6">
                {t("app.artists.discography")}
              </Heading>
            </VStack>
            {error && <ErrorDisplay error={error} />}
          </>
        }
        ListFooterComponent={
          <Box className="bg-black">
            <VStack className="px-6 py-6 bg-black">
              <Text className="text-white font-bold">
                {t("app.artists.albumCount", { count: albums.length })}
              </Text>
              {albums.length > 3 && (
                <Center>
                  <FadeOutScaleDown
                    href={{
                      pathname: "/artists/[id]/discography",
                      params: { id, name: data?.artist?.name },
                    }}
                    className="rounded-full border border-gray-300 py-1 px-3"
                  >
                    <Text className="text-gray-300">
                      {t("app.shared.seeAll")}
                    </Text>
                  </FadeOutScaleDown>
                </Center>
              )}
            </VStack>
            {albums.length > 0 && (
              <VStack className="px-6 pb-6 bg-black">
                <FadeOutScaleDown
                  href={{
                    pathname: "/artists/[id]/all-songs",
                    params: { id },
                  }}
                >
                  <HStack className="items-center">
                    <Box className="relative">
                      <Image
                        source={{ uri: artworkUrl(data?.artist?.coverArt) }}
                        alt="All songs cover"
                        className="w-16 h-16 rounded-full aspect-square"
                      />
                      <Box className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-black items-center justify-center">
                        <ListMusic size={14} color={emerald500} />
                      </Box>
                    </Box>
                    <VStack className="ml-4 flex-1">
                      <Heading
                        className="text-white"
                        size="md"
                        numberOfLines={1}
                      >
                        {t("app.artists.allSongs")}
                      </Heading>
                      <Text className="text-primary-100" numberOfLines={1}>
                        {allSongsCount > 0 && (
                          <>
                            {t("app.shared.songCount", {
                              count: allSongsCount,
                            })}
                            {" • "}
                          </>
                        )}
                        {data?.artist?.name}
                      </Text>
                    </VStack>
                    <ChevronRight color={white} />
                  </HStack>
                </FadeOutScaleDown>
              </VStack>
            )}
            {appearsOnAlbums.length > 0 && (
              <VStack className="bg-black pb-6">
                <Heading className="text-white mb-4 px-6">
                  {t("app.artists.appearsOn")}
                </Heading>
                {/* Padding on the scroll content, not the wrapper: an inset
                    ScrollView clips its items at both edges mid-scroll. The
                    trailing gap comes from the last item's own mr-6. */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="pl-6"
                >
                  {appearsOnAlbums.map((album, index) => (
                    <AlbumListItem
                      key={album.id}
                      album={album}
                      index={index}
                      layout="horizontal"
                    />
                  ))}
                </ScrollView>
              </VStack>
            )}
            {/* Two kinds of "similar", so two rows rather than one blended
                list: AudioMuse compares how the artists actually sound, while
                the backend's own list reflects what listeners play together.
                Each says where it came from, and they are deliberately not
                de-duplicated — an artist both agree on is signal. */}
            <ArtistCarouselRow
              title={t("app.artists.similarArtists")}
              subtitle={t("app.artists.similarArtistsSource")}
              artists={(artistInfoData?.artistInfo2?.similarArtist ?? []).slice(
                0,
                SIMILAR_ARTISTS_LIMIT,
              )}
            />
            <AudioMuseSimilarArtists
              artistId={id}
              artistName={data?.artist?.name}
            />
            {artistInfoData?.artistInfo2?.biography && (
              <VStack className="px-6 bg-black">
                <Heading className="text-white mb-6">
                  {t("app.artists.about")}
                </Heading>
                <FadeOutScaleDown
                  href={{
                    pathname: "/artists/[id]/biography",
                    params: {
                      id,
                      biography: artistInfoData?.artistInfo2?.biography,
                      name: data?.artist?.name,
                      musicBrainzId: artistInfoData?.artistInfo2?.musicBrainzId,
                      lastFmUrl: artistInfoData?.artistInfo2?.lastFmUrl,
                    },
                  }}
                >
                  <ImageBackground
                    source={{
                      uri:
                        artistInfoData?.artistInfo2?.mediumImageUrl ??
                        artworkUrl(data?.artist?.coverArt),
                    }}
                    alt="Artist cover"
                    contentFit="cover"
                    className="aspect-square"
                  >
                    <Box className="absolute inset-0">
                      <LinearGradient
                        colors={["transparent", black]}
                        style={{
                          width: "100%",
                          height: "100%",
                          justifyContent: "flex-end",
                          padding: 24,
                        }}
                      >
                        <RichText className="text-white" numberOfLines={3}>
                          {artistInfoData?.artistInfo2?.biography}
                        </RichText>
                      </LinearGradient>
                    </Box>
                  </ImageBackground>
                </FadeOutScaleDown>
              </VStack>
            )}
          </Box>
        }
        ListEmptyComponent={
          <Box className="bg-black">
            <EmptyDisplay />
          </Box>
        }
        contentContainerStyle={{
          paddingBottom: screenBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
      />
      <CenteredBottomSheetModal
        ref={bottomSheetModalRef}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
      >
        <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
          <Box className="p-6 w-full mb-12">
            <HStack className="items-center">
              {data?.artist?.coverArt ? (
                <Image
                  source={{ uri: artworkUrl(data?.artist?.coverArt) }}
                  className="w-16 h-16 rounded-full aspect-square"
                  alt="Track cover"
                />
              ) : (
                <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                  <User size={24} color={white} />
                </Box>
              )}
              <VStack className="ml-4 flex-1">
                <Heading
                  className="text-white font-normal"
                  size="lg"
                  numberOfLines={1}
                >
                  {data?.artist?.name}
                </Heading>
              </VStack>
            </HStack>
            <VStack className="mt-6 gap-y-8">
              {capabilities.setRating && (
                <FadeOutScaleDown onPress={handleRatingPress}>
                  <HStack className="items-center justify-between">
                    <HStack className="items-center">
                      <Star size={24} color={gray200} />
                      <Text className="ml-4 text-lg text-gray-200">
                        {t("app.artists.rate")}
                      </Text>
                    </HStack>
                    <HStack className="items-center">
                      {data?.artist?.userRating && (
                        <Text className="ml-4 text-lg text-emerald-500">
                          {data?.artist?.userRating}/5
                        </Text>
                      )}
                    </HStack>
                  </HStack>
                </FadeOutScaleDown>
              )}
              {data?.artist?.musicBrainzId && (
                <FadeOutScaleDown
                  onPress={handleMusicBrainzPress}
                  disabled={!isOnline}
                >
                  <HStack className="items-center">
                    <MusicBrainz width={24} height={24} fill={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.artists.musicBrainz")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
              {data?.artist?.name && (
                <FadeOutScaleDown
                  onPress={handleLastFMPress}
                  disabled={!isOnline}
                >
                  <HStack className="items-center">
                    <LastFM width={24} height={24} fill={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.artists.lastFM")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
            </VStack>
          </Box>
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
      <RatingModal
        isOpen={showRatingModal}
        onClose={handleCloseRatingModal}
        title={t("app.artists.rateModalTitle")}
        value={data?.artist?.userRating || 0}
        onConfirm={handleRatingChange}
        isPending={doSetRating.isPending}
      />
    </Box>
  );
}
