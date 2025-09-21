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
import { useArtist, useTopSongs } from "@/hooks/openSubsonic/useBrowsing";
import { useStar, useUnstar } from "@/hooks/openSubsonic/useMediaAnnotation";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
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
  Share,
  Shuffle,
  User,
} from "lucide-react-native";
import { useCallback, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FLOATING_PLAYER_HEIGHT } from "../FloatingPlayer";

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
  const {
    data: topSongsData,
    isLoading: isLoadingTopSongs,
    error: topSongsError,
  } = useTopSongs(data?.artist.name, { count: 10 });
  const doFavorite = useStar();
  const doUnfavorite = useUnstar();
  const addRecentPlay = useRecentPlays.use.addRecentPlay();

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

  return (
    <Box className="h-full">
      <FlashList
        data={data?.artist.album || loadingData(3)}
        renderItem={({ item, index }: { item: AlbumID3; index: number }) =>
          isLoading ? (
            <AlbumListItemSkeleton index={index} />
          ) : (
            <AlbumListItem album={item} index={index} />
          )
        }
        keyExtractor={(item) => item.id}
        ListHeaderComponent={() => (
          <>
            <ImageBackground
              source={{ uri: artworkUrl(data?.artist?.coverArt) }}
              alt="Artist cover"
              className="h-96"
              resizeMode="cover"
            >
              <LinearGradient
                colors={["transparent", "#000000"]}
                className="h-96"
              >
                <Box
                  className="bg-black/25 flex-1 "
                  style={{ paddingTop: insets.top }}
                >
                  <VStack className="mt-6 px-6 items-start justify-between h-full -mb-12">
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
                      className="text-white mb-4"
                      size="3xl"
                    >
                      {data?.artist.name}
                    </Heading>
                  </VStack>
                </Box>
              </LinearGradient>
            </ImageBackground>
            <VStack className="px-6">
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
              <Heading className="text-white">Discography</Heading>
            </VStack>
            {error && <ErrorDisplay error={error} />}
          </>
        )}
        ListFooterComponent={() => (
          <VStack className="px-6 my-6">
            <Text className="text-white font-bold">
              {data?.artist.album?.length} albums
            </Text>
          </VStack>
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
            <VStack className="mt-6 gap-y-8" />
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
    </Box>
  );
}
