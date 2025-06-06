import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import AlbumListItem from "@/components/albums/AlbumListItem";
import TrackListItem from "@/components/tracks/TrackListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { ImageBackground } from "@/components/ui/image-background";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useArtist, useTopSongs } from "@/hooks/openSubsonic/useBrowsing";
import { useStar, useUnstar } from "@/hooks/openSubsonic/useMediaAnnotation";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
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

export default function ArtistScreen() {
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const { data, isLoading, error } = useArtist(id);
  const cover = useGetCoverArt(
    data?.artist.coverArt,
    { size: 400 },
    !!data?.artist.coverArt,
  );
  const {
    data: topSongsData,
    isLoading: isLoadingTopSongs,
    error: topSongsError,
  } = useTopSongs(data?.artist.name, { count: 10 });
  const doFavorite = useStar();
  const doUnfavorite = useUnstar();

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

  return (
    <Box className="h-full">
      <FlashList
        data={data?.artist.album}
        renderItem={({ item, index }: { item: AlbumID3; index: number }) => (
          <AlbumListItem album={item} index={index} />
        )}
        keyExtractor={(item) => item.id}
        estimatedItemSize={70}
        ListHeaderComponent={() => (
          <>
            <ImageBackground
              source={{ uri: `data:image/jpeg;base64,${cover?.data}` }}
              alt="Artist cover"
              className="h-96"
              resizeMode="cover"
            >
              <LinearGradient
                colors={["transparent", "#000000"]}
                className="h-96"
              >
                <Box className="bg-black/25 flex-1">
                  <SafeAreaView>
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
                        className="text-white"
                        size="3xl"
                      >
                        {data?.artist.name}
                      </Heading>
                    </VStack>
                  </SafeAreaView>
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
              <VStack>
                {topSongsError && <ErrorDisplay error={topSongsError} />}
                {isLoadingTopSongs && <Spinner size="large" />}
                {topSongsData?.topSongs.song?.map((song, index) => (
                  <TrackListItem
                    key={song.id}
                    showIndex
                    track={song}
                    index={index}
                  />
                ))}
                {!isLoadingTopSongs &&
                  !topSongsError &&
                  !topSongsData?.topSongs.song?.length && <EmptyDisplay />}
              </VStack>
              <Heading className="text-white">Discography</Heading>
            </VStack>
            {error && <ErrorDisplay error={error} />}
            {isLoading && <Spinner size="large" />}
          </>
        )}
        ListFooterComponent={() => (
          <VStack className="px-6 my-6">
            <Text className="text-white font-bold">14 songs ⦁ 45 min</Text>
          </VStack>
        )}
        ListEmptyComponent={() => <EmptyDisplay />}
        contentContainerStyle={{ paddingHorizontal: 0 }}
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
          <Box className="p-6 w-full pb-12">
            <HStack className="items-center">
              {cover?.data ? (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${cover.data}` }}
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
            <VStack className="mt-6 gap-y-8"></VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
    </Box>
  );
}
