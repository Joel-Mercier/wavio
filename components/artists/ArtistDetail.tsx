import LastFM from "@/assets/images/lastfm.svg";
import MusicBrainz from "@/assets/images/musicbrainz.svg";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import AlbumListItem from "@/components/albums/AlbumListItem";
import AlbumListItemSkeleton from "@/components/albums/AlbumListItemSkeleton";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { ImageBackground } from "@/components/ui/image-background";
import { Text } from "@/components/ui/text";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import {
  useArtist,
  useArtistInfo2,
  useTopSongs,
} from "@/hooks/openSubsonic/useBrowsing";
import { useStar, useUnstar } from "@/hooks/openSubsonic/useMediaAnnotation";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useImageColors from "@/hooks/useImageColors";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import useRecentPlays from "@/stores/recentPlays";
import { artworkUrl } from "@/utils/artwork";
import { loadingData } from "@/utils/loadingData";
import { cn } from "@/utils/tailwind";
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
  EllipsisVertical,
  Heart,
  Play,
  Shuffle,
  User,
} from "lucide-react-native";
import { useCallback, useRef } from "react";
import { Linking } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FLOATING_PLAYER_HEIGHT } from "../FloatingPlayer";

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);
const AnimatedBox = Animated.createAnimatedComponent(Box);
export default function ArtistDetail() {
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const { data, isLoading, error } = useArtist(id);
  const { data: artistInfoData, isLoading: isLoadingArtistInfo } =
    useArtistInfo2(id);
  const {
    data: topSongsData,
    isLoading: isLoadingTopSongs,
    error: topSongsError,
  } = useTopSongs(data?.artist.name, { count: 10 });
  const doFavorite = useStar();
  const doUnfavorite = useUnstar();
  const addRecentPlay = useRecentPlays.use.addRecentPlay();
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
                <ToastDescription>
                  Artist successfully added to favorites
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
                <ToastDescription>
                  An error occurred while adding artist to favorites
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
                <ToastDescription>
                  Artist successfully removed from favorites
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
                <ToastDescription>
                  An error occurred while removing the artist from favorites
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
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

  console.log("ARTIST INFO", artistInfoData);
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
            <Heading className="text-white font-bold" size="lg">
              {data?.artist.name}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </AnimatedBox>
      <ImageBackground
        source={{ uri: artworkUrl(data?.artist?.coverArt) }}
        alt="Artist cover"
        className="h-96 absolute top-0 left-0 right-0"
        resizeMode="cover"
      />

      <AnimatedFlashList
        onScroll={scrollHandler}
        data={data?.artist.album || loadingData(3)}
        renderItem={({ item, index }: { item: AlbumID3; index: number }) =>
          isLoading ? (
            <AlbumListItemSkeleton index={index} />
          ) : (
            <Box className="bg-black">
              <AlbumListItem album={item} index={index} />
            </Box>
          )
        }
        keyExtractor={(item) => item.id}
        ListHeaderComponent={() => (
          <>
            <LinearGradient
              colors={["transparent", "#000000"]}
              className="h-96"
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
                    {data?.artist.name}
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
                  <FadeOutScaleDown>
                    <Box className="w-12 h-12 rounded-full bg-emerald-500 items-center justify-center">
                      <Play
                        color={themeConfig.theme.colors.white}
                        fill={themeConfig.theme.colors.white}
                      />
                    </Box>
                  </FadeOutScaleDown>
                </HStack>
              </HStack>
              <Heading className="text-white">Top songs</Heading>
              <VStack
                className={cn("overflow-hidden mb-4", {
                  "h-[450px]":
                    (topSongsData?.topSongs.song?.length || 0) > 5 ||
                    isLoadingTopSongs,
                })}
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
                        onPlayCallback={handleTrackPressCallback}
                      />
                    ))}
                  </>
                )}

                {!isLoadingTopSongs &&
                  !topSongsError &&
                  !topSongsData?.topSongs.song?.length && <EmptyDisplay />}
                {(topSongsData?.topSongs?.song?.length || 0) > 5 && (
                  <>
                    <LinearGradient
                      className="absolute h-[90px] bottom-0 left-0 right-0"
                      colors={["transparent", "rgba(0, 0, 0, 0.5)", "#000"]}
                      locations={[0, 0.3, 0.7]}
                    />
                    <Center className="absolute bottom-0 left-0 right-0">
                      <FadeOutScaleDown className="rounded-full border border-gray-300 py-1 px-3">
                        <Text className="text-gray-300">See more</Text>
                      </FadeOutScaleDown>
                    </Center>
                  </>
                )}
              </VStack>
              <Heading className="text-white mb-6">Discography</Heading>
            </VStack>
            {error && <ErrorDisplay error={error} />}
          </>
        )}
        ListFooterComponent={() => (
          <>
            <VStack className="px-6 py-6 bg-black">
              <Text className="text-white font-bold">
                {data?.artist.album?.length} albums
              </Text>
            </VStack>
            {artistInfoData?.artistInfo2?.biography && (
              <VStack className="px-6 bg-black">
                <Heading className="text-white mb-6">About</Heading>
                <FadeOutScaleDown
                  href={{
                    pathname: `/artists/${id}/biography`,
                    params: {
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
                    resizeMode="cover"
                    className="aspect-square"
                  >
                    <Box className="absolute inset-0">
                      <LinearGradient
                        colors={["transparent", "#000"]}
                        className="h-full w-full p-6 flex justify-end"
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
                  {data?.artist.name}
                </Heading>
              </VStack>
            </HStack>
            <VStack className="mt-6 gap-y-8">
              {data?.artist?.musicBrainzId && (
                <FadeOutScaleDown onPress={handleMusicBrainzPress}>
                  <HStack className="items-center">
                    <MusicBrainz
                      width={24}
                      height={24}
                      fill={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      Open in MusicBrainz
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
                      Open in Last.fm
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
    </Box>
  );
}
