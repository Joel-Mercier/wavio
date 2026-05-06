import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ChevronRight,
  EllipsisVertical,
  Heart,
  Pause,
  Play,
  Shuffle,
  Star,
  User,
  X,
} from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
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
import LastFM from "@/assets/images/lastfm.svg";
import MusicBrainz from "@/assets/images/musicbrainz.svg";
import AlbumListItem from "@/components/albums/AlbumListItem";
import AlbumListItemSkeleton from "@/components/albums/AlbumListItemSkeleton";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import StarRating from "@/components/StarRating";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Icon } from "@/components/ui/icon";
import { Image } from "@/components/ui/image";
import { ImageBackground } from "@/components/ui/image-background";
import {
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
} from "@/components/ui/modal";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import {
  useArtist,
  useArtistInfo2,
  useTopSongs,
} from "@/hooks/openSubsonic/useBrowsing";
import { useStarred2 } from "@/hooks/openSubsonic/useLists";
import {
  useSetRating,
  useStar,
  useUnstar,
} from "@/hooks/openSubsonic/useMediaAnnotation";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useImageColors from "@/hooks/useImageColors";
import { getAlbum } from "@/services/openSubsonic/browsing";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import useActivity from "@/stores/activity";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import useRecentPlays from "@/stores/recentPlays";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";
import { loadingData } from "@/utils/loadingData";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;
const AnimatedBox = Animated.createAnimatedComponent(Box);

export default function ArtistDetail() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [showRatingModal, setShowRatingModal] = useState<boolean>(false);
  const [topSongsExpanded, setTopSongsExpanded] = useState<boolean>(false);
  const [topSongsContentHeight, setTopSongsContentHeight] = useState<number>(0);
  const TOP_SONGS_COLLAPSED_HEIGHT = 450;
  const topSongsHeight = useSharedValue<number>(TOP_SONGS_COLLAPSED_HEIGHT);
  const topSongsOverlayOpacity = useSharedValue<number>(1);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const { data, isLoading, error } = useArtist(id);
  const { data: artistInfoData, isLoading: isLoadingArtistInfo } =
    useArtistInfo2(id, { count: 10 });
  console.log(data?.artist.userRating);
  const {
    data: topSongsData,
    isLoading: isLoadingTopSongs,
    error: topSongsError,
  } = useTopSongs(data?.artist?.name ?? "", { count: 10 });
  const musicFolderId = useCurrentMusicFolderId();
  const { data: starredData } = useStarred2({ musicFolderId });
  const likedSongs =
    starredData?.starred2?.song?.filter((song) => song.artistId === id) ?? [];
  const likedAlbums =
    starredData?.starred2?.album?.filter((album) => album.artistId === id) ??
    [];
  const doFavorite = useStar();
  const doUnfavorite = useUnstar();
  const doSetRating = useSetRating();
  const addRecentPlay = useRecentPlays((store) => store.addRecentPlay);
  const recordActivity = useActivity((store) => store.recordActivity);
  const colors = useImageColors(artworkUrl(data?.artist?.coverArt));
  const offsetY = useSharedValue(0);
  const headerStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        offsetY.value,
        [0, 204],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    };
  });
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
    queryClient.setQueryData(["artist", id], {
      ...data,
      artist: {
        ...data?.artist,
        starred: new Date().toISOString(),
      },
    });
    doFavorite.mutate(
      { id: data?.artist.id, artistId: data?.artist.id },
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
    queryClient.setQueryData(["artist", id], {
      ...data,
      artist: {
        ...data?.artist,
        starred: undefined,
      },
    });
    doUnfavorite.mutate(
      { id: data?.artist.id, artistId: data?.artist.id },
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
  const playingTrack = usePlayingTrack();
  const isPlayingFromArtist = playingTrack?.artistId === id;
  const handlePlayPress = async () => {
    if (isPlayingFromArtist) {
      togglePlayPause();
      return;
    }
    const topSongs = topSongsData?.topSongs?.song;
    if (topSongs && topSongs.length > 0) {
      playTracks(topSongs.map(childToTrack), 0);
    } else {
      const firstAlbumId = data?.artist?.album?.[0]?.id;
      if (!firstAlbumId) return;
      try {
        const albumData = await queryClient.fetchQuery({
          queryKey: ["album", firstAlbumId],
          queryFn: () => getAlbum(firstAlbumId),
        });
        const songs = albumData?.album?.song;
        if (!songs || songs.length === 0) return;
        playTracks(songs.map(childToTrack), 0);
      } catch (e) {
        console.error(e);
        return;
      }
    }
    if (data?.artist) {
      addRecentPlay({
        id,
        title: data.artist.name,
        type: "artist",
        coverArt: data.artist.coverArt,
      });
      recordActivity({
        id,
        title: data.artist.name,
        type: "artist",
        coverArt: data.artist.coverArt,
      });
    }
  };

  const handleTrackPressCallback = () => {
    if (data?.artist) {
      addRecentPlay({
        id,
        title: data?.artist.name,
        type: "artist",
        coverArt: data?.artist?.coverArt,
      });
      recordActivity({
        id,
        title: data.artist.name,
        type: "artist",
        coverArt: data.artist.coverArt,
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
          // queryClient.setQueryData(["artist", data.artist.id], {
          //   ...data.artist,
          //   userRating: rating,
          // });
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
          console.error(error);
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
        <LinearGradient
          colors={[
            (colors?.platform === "ios" ? colors.primary : colors?.vibrant) ||
              "#000",
            (colors?.platform === "ios"
              ? colors.primary
              : colors?.darkVibrant) || "#000",
          ]}
        >
          <HStack
            className="items-center justify-between pb-4 px-6 bg-black/25"
            style={{ paddingTop: insets.top + 16 }}
          >
            <FadeOutScaleDown onPress={() => router.back()}>
              <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                <ArrowLeft size={24} color={themeConfig.theme.colors.white} />
              </Box>
            </FadeOutScaleDown>
            <Heading
              numberOfLines={1}
              className="text-white text-center font-bold ml-6 truncate flex-1"
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
        className="h-96 absolute top-0 left-0 right-0"
        contentFit="cover"
      />

      <AnimatedFlashList
        onScroll={scrollHandler}
        data={data?.artist?.album?.slice(0, 3) || loadingData(3)}
        renderItem={({ item, index }: { item: AlbumID3; index: number }) =>
          isLoading ? (
            <AlbumListItemSkeleton index={index} />
          ) : (
            <Box className="bg-black">
              <AlbumListItem album={item} index={index} />
            </Box>
          )
        }
        keyExtractor={(item: AlbumID3) => item.id}
        ListHeaderComponent={() => (
          <>
            <LinearGradient
              colors={["transparent", "#000000"]}
              className="h-96"
              style={{ height: 384 }}
            >
              <Box className="flex-1 " style={{ paddingTop: insets.top }}>
                <VStack className="mt-6 px-6 items-start justify-between h-full">
                  <FadeOutScaleDown onPress={() => router.back()}>
                    <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                      <ArrowLeft
                        size={24}
                        color={themeConfig.theme.colors.white}
                      />
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
                  {data?.artist?.starred ? (
                    <FadeOutScaleDown onPress={handleUnfavoritePress}>
                      <Heart
                        color={themeConfig.theme.colors.emerald[500]}
                        fill={themeConfig.theme.colors.emerald[500]}
                      />
                    </FadeOutScaleDown>
                  ) : (
                    <FadeOutScaleDown onPress={handleFavoritePress}>
                      <Heart color={themeConfig.theme.colors.white} />
                    </FadeOutScaleDown>
                  )}
                  <FadeOutScaleDown onPress={handlePresentModalPress}>
                    <EllipsisVertical color={themeConfig.theme.colors.white} />
                  </FadeOutScaleDown>
                </HStack>
                <HStack className="items-center gap-x-4">
                  <FadeOutScaleDown>
                    <Shuffle color={themeConfig.theme.colors.white} />
                  </FadeOutScaleDown>
                  <FadeOutScaleDown onPress={handlePlayPress}>
                    <Box className="w-12 h-12 rounded-full bg-emerald-500 items-center justify-center">
                      {isPlayingFromArtist && isPlaying ? (
                        <Pause
                          color={themeConfig.theme.colors.white}
                          fill={themeConfig.theme.colors.white}
                        />
                      ) : (
                        <Play
                          color={themeConfig.theme.colors.white}
                          fill={themeConfig.theme.colors.white}
                        />
                      )}
                    </Box>
                  </FadeOutScaleDown>
                </HStack>
              </HStack>
              {likedSongs.length > 0 && (
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
                        <Heart
                          size={14}
                          color={themeConfig.theme.colors.emerald[500]}
                          fill={themeConfig.theme.colors.emerald[500]}
                        />
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
                    <ChevronRight color={themeConfig.theme.colors.white} />
                  </HStack>
                </FadeOutScaleDown>
              )}
              <Heading className="text-white">
                {t("app.artists.topSongs")}
              </Heading>
              <AnimatedBox
                className="overflow-hidden mb-4"
                style={
                  (topSongsData?.topSongs.song?.length || 0) > 5 ||
                  isLoadingTopSongs
                    ? topSongsAnimatedStyle
                    : undefined
                }
              >
                <Box
                  onLayout={(e) => {
                    const h = e.nativeEvent.layout.height;
                    if (h && h !== topSongsContentHeight) {
                      setTopSongsContentHeight(h);
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
                      {topSongsData?.topSongs.song?.map((song, index) => (
                        <TrackListItem
                          key={song.id}
                          showIndex
                          track={song}
                          index={index}
                          trackList={topSongsData?.topSongs.song}
                          onPlayCallback={handleTrackPressCallback}
                        />
                      ))}
                    </>
                  )}

                  {!isLoadingTopSongs &&
                    !topSongsError &&
                    !topSongsData?.topSongs.song?.length && <EmptyDisplay />}
                </Box>
                {(topSongsData?.topSongs?.song?.length || 0) > 5 && (
                  <>
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
                          height: 90,
                        }}
                        colors={["transparent", "rgba(0, 0, 0, 0.5)", "#000"]}
                        locations={[0, 0.3, 0.7]}
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
                    <Animated.View
                      pointerEvents={topSongsExpanded ? "auto" : "none"}
                      style={[
                        {
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                        },
                        topSongsSeeLessStyle,
                      ]}
                    >
                      <Center>
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
                  </>
                )}
              </AnimatedBox>
              <Heading className="text-white mb-6">
                {t("app.artists.discography")}
              </Heading>
            </VStack>
            {error && <ErrorDisplay error={error} />}
          </>
        )}
        ListFooterComponent={() => (
          <>
            <VStack className="px-6 py-6 bg-black">
              <Text className="text-white font-bold">
                {t("app.artists.albumCount", {
                  count: data?.artist?.album?.length || 0,
                })}
              </Text>
              {(data?.artist?.album?.length || 0) > 3 && (
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
                      uri: artistInfoData?.artistInfo2?.mediumImageUrl,
                    }}
                    alt="Artist cover"
                    contentFit="cover"
                    className="aspect-square"
                  >
                    <Box className="absolute inset-0">
                      <LinearGradient
                        colors={["transparent", "#000"]}
                        style={{
                          width: "100%",
                          height: "100%",
                          justifyContent: "flex-end",
                          padding: 24,
                        }}
                      >
                        <Text className="text-white" numberOfLines={3}>
                          {artistInfoData?.artistInfo2?.biography}
                        </Text>
                      </LinearGradient>
                    </Box>
                  </ImageBackground>
                </FadeOutScaleDown>
              </VStack>
            )}
          </>
        )}
        ListEmptyComponent={() => <EmptyDisplay />}
        contentContainerStyle={{
          paddingBottom: bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
        }}
        showsVerticalScrollIndicator={false}
      />
      <BottomSheetModal
        ref={bottomSheetModalRef}
        onChange={handleSheetPositionChange}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView
          style={{
            flex: 1,
            alignItems: "center",
          }}
        >
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
                  <User size={24} color={themeConfig.theme.colors.white} />
                </Box>
              )}
              <VStack className="ml-4">
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
              <FadeOutScaleDown onPress={handleRatingPress}>
                <HStack className="items-center justify-between">
                  <HStack className="items-center">
                    <Star
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
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
              {data?.artist?.musicBrainzId && (
                <FadeOutScaleDown onPress={handleMusicBrainzPress}>
                  <HStack className="items-center">
                    <MusicBrainz
                      width={24}
                      height={24}
                      fill={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.artists.musicBrainz")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
              {data?.artist?.name && (
                <FadeOutScaleDown onPress={handleLastFMPress}>
                  <HStack className="items-center">
                    <LastFM
                      width={24}
                      height={24}
                      fill={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.artists.lastFM")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
      <Modal
        isOpen={showRatingModal}
        onClose={handleCloseRatingModal}
        closeOnOverlayClick
      >
        <ModalBackdrop />
        <ModalContent
          className="bg-primary-800 border-primary-600 max-h-[80%]"
          style={{ marginBottom: insets.bottom, marginTop: insets.top }}
        >
          <ModalHeader>
            <Heading className="text-white">
              {t("app.artists.rateModalTitle")}
            </Heading>
            <ModalCloseButton>
              <Icon as={X} size="md" className="color-white" />
            </ModalCloseButton>
          </ModalHeader>
          <ModalBody className="mb-0 pb-0">
            <StarRating
              value={data?.artist?.userRating || 0}
              onChange={handleRatingChange}
            />
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
