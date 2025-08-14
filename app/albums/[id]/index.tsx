import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import TrackListItem from "@/components/tracks/TrackListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useAlbum } from "@/hooks/openSubsonic/useBrowsing";
import { useStar, useUnstar } from "@/hooks/openSubsonic/useMediaAnnotation";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import { useCreateShare } from "@/hooks/openSubsonic/useSharing";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useImageColors from "@/hooks/useImageColors";
import type { Child } from "@/services/openSubsonic/types";
import useRecentPlays from "@/stores/recentPlays";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Disc3,
  EllipsisVertical,
  Heart,
  ListPlus,
  Play,
  PlusCircle,
  Share2,
  Shuffle,
  User,
} from "lucide-react-native";
import React, { useCallback, useRef } from "react";

export default function AlbumScreen() {
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const doFavorite = useStar();
  const doUnfavorite = useUnstar();
  const doShare = useCreateShare();
  const toast = useToast();
  const { data, isLoading, error } = useAlbum(id);
  const cover = useGetCoverArt(
    data?.album.coverArt,
    { size: 400 },
    !!data?.album.coverArt,
  );
  const colors = useImageColors(`data:image/jpeg;base64,${cover?.data}`);
  const addRecentPlay = useRecentPlays.use.addRecentPlay();

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleGoToArtistPress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.navigate(`/artists/${data?.album.artists[0].id}`);
  };

  const handleFavoritePress = () => {
    queryClient.setQueryData(["album", id], {
      ...data,
      album: {
        ...data?.album,
        starred: new Date().toISOString(),
      },
    });
    doFavorite.mutate(
      { id: data?.album.id, albumId: data?.album.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["starred2"] });
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastDescription>
                  Album successfully added to favorites
                </ToastDescription>
              </Toast>
            ),
          });
        },
        onError: (error) => {
          queryClient.setQueryData(["album", id], {
            ...data,
            album: {
              ...data?.album,
              starred: undefined,
            },
          });
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastDescription>
                  An error occurred while adding album to favorites
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const handleUnfavoritePress = () => {
    queryClient.setQueryData(["album", id], {
      ...data,
      album: {
        ...data?.album,
        starred: undefined,
      },
    });
    doUnfavorite.mutate(
      { id: data?.album.id, albumId: data?.album.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["starred2"] });
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastDescription>
                  Album successfully removed from favorites
                </ToastDescription>
              </Toast>
            ),
          });
        },
        onError: (error) => {
          queryClient.setQueryData(["album", id], {
            ...data,
            album: {
              ...data?.album,
              starred: new Date().toISOString(),
            },
          });
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastDescription>
                  An error occurred while removing the album from favorites
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const handleSharePress = () => {
    doShare.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["shares"] });
          bottomSheetModalRef.current?.dismiss();
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastDescription>Album successfully shared</ToastDescription>
              </Toast>
            ),
          });
        },
        onError: (error) => {
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastDescription>
                  An error occurred while sharing the album
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const handleAddToPlaylistPress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.navigate({
      pathname: "/playlists/add-to-playlist",
      params: { ids: data?.album.song?.map((song) => song.id) },
    });
  };

  const handleTrackPressCallback = () => {
    if (data?.album) {
      addRecentPlay({
        id,
        title: data?.album.name,
        type: "album",
        coverArt: cover?.data,
      });
    }
  };

  return (
    <Box className="h-full w-full">
      <FlashList
        data={data?.album.song}
        renderItem={({ item, index }: { item: Child; index: number }) => (
          <TrackListItem
            track={item}
            cover={cover?.data}
            index={index}
            className="px-6"
            onPlayCallback={handleTrackPressCallback}
          />
        )}
        ListHeaderComponent={() => (
          <LinearGradient
            colors={[
              (colors?.platform === "ios" ? colors.primary : colors?.vibrant) ||
                "#000",
              "#000",
            ]}
            locations={[0, 0.8]}
            className="px-6"
          >
            <SafeAreaView>
              <HStack className="mt-6 items-start justify-between">
                <FadeOutScaleDown onPress={() => router.back()}>
                  <ArrowLeft size={24} color={themeConfig.theme.colors.white} />
                </FadeOutScaleDown>
                {cover.isLoading ? (
                  <Box className="w-[70%] aspect-square rounded-md bg-primary-600 items-center justify-center">
                    <Disc3 size={48} color={themeConfig.theme.colors.white} />
                  </Box>
                ) : (
                  <Image
                    source={{
                      uri: `data:image/jpeg;base64,${cover?.data}`,
                    }}
                    className="w-[70%] aspect-square rounded-md"
                    alt="Album cover"
                  />
                )}
                <Box className="w-6" />
              </HStack>
              <VStack>
                <HStack className="mt-5 items-center justify-between">
                  <Heading numberOfLines={1} className="text-white" size="2xl">
                    {data?.album.name}
                  </Heading>
                </HStack>
                <HStack className="mt-4 items-center">
                  <Box className="w-8 h-8 rounded-full bg-primary-600 items-center justify-center">
                    <User size={16} color={themeConfig.theme.colors.white} />
                  </Box>
                  <Text
                    className="ml-4 text-white text-md font-bold"
                    numberOfLines={1}
                  >
                    {((data?.album?.artists?.length || 0) > 1 &&
                      data?.album.artists?.map((artist) => (
                        <Link key={artist.id} href={`/artists/${artist.id}`}>
                          {artist.name}
                        </Link>
                      ))) || (
                        <Link href={`/artists/${data?.album.artistId}`}>
                          {data?.album.displayArtist}
                        </Link>
                      ) || (
                        <Link href={`/artists/${data?.album.artistId}`}>
                          {data?.album.artist}
                        </Link>
                      )}
                  </Text>
                </HStack>
                <HStack className="mt-2 items-center">
                  <Text className="text-primary-100">
                    {data?.album.isCompilation ? "Compilation" : "Album"} ⦁{" "}
                    {data?.album.originalReleaseDate &&
                      format(
                        parse(
                          `${data?.album.originalReleaseDate?.day}/${data?.album.originalReleaseDate?.month}/${data?.album.originalReleaseDate?.year}`,
                          "d/M/yyyy",
                          new Date(),
                        ),
                        "dd MMM yyyy",
                      )}
                  </Text>
                </HStack>
                <HStack className="mt-4 items-center justify-between">
                  <HStack className="items-center gap-x-4">
                    {data?.album.starred ? (
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
                      <EllipsisVertical
                        color={themeConfig.theme.colors.white}
                      />
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
              </VStack>
              {error && <ErrorDisplay error={error} />}
              {isLoading && <Spinner size="large" />}
            </SafeAreaView>
          </LinearGradient>
        )}
        ListFooterComponent={() => (
          <VStack className="my-6 px-6">
            <Text className="text-white font-bold">
              {(data?.album.songCount || "0 ") +
                (data?.album.songCount || 0 > 1 ? " song" : "songs")}{" "}
              ⦁ {Math.round((data?.album.duration || 0) / 60)} min
            </Text>
            {data?.album.recordLabels?.map((recordLabel) => (
              <Text className="text-primary-100 text-sm" key={recordLabel.name}>
                © {recordLabel.name}
              </Text>
            ))}
          </VStack>
        )}
        ListEmptyComponent={() => <EmptyDisplay />}
        // contentContainerStyle={{ paddingHorizontal: 24 }}
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
                  className="w-16 h-16 rounded-md aspect-square"
                  alt="Track cover"
                />
              ) : (
                <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                  <Disc3 size={24} color={themeConfig.theme.colors.white} />
                </Box>
              )}
              <VStack className="ml-4">
                <Heading
                  className="text-white font-normal"
                  size="lg"
                  numberOfLines={1}
                >
                  {data?.album.name}
                </Heading>
                <Text numberOfLines={1} className="text-md text-primary-100">
                  {data?.album.artist}
                </Text>
              </VStack>
            </HStack>
            <VStack className="mt-6 gap-y-8">
              <FadeOutScaleDown onPress={handleAddToPlaylistPress}>
                <HStack className="items-center">
                  <PlusCircle
                    size={24}
                    color={themeConfig.theme.colors.gray[200]}
                  />
                  <Text className="ml-4 text-lg text-gray-200">
                    Add to playlist
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={handleGoToArtistPress}>
                <HStack className="items-center">
                  <User size={24} color={themeConfig.theme.colors.gray[200]} />
                  <Text className="ml-4 text-lg text-gray-200">
                    Go to artist
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown>
                <HStack className="items-center">
                  <ListPlus
                    size={24}
                    color={themeConfig.theme.colors.gray[200]}
                  />
                  <Text className="ml-4 text-lg text-gray-200">
                    Add to queue
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={handleSharePress}>
                <HStack className="items-center">
                  <Share2
                    size={24}
                    color={themeConfig.theme.colors.gray[200]}
                  />
                  <Text className="ml-4 text-lg text-gray-200">Share</Text>
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
    </Box>
  );
}
