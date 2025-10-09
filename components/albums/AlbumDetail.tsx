import LastFM from "@/assets/images/lastfm.svg";
import MusicBrainz from "@/assets/images/musicbrainz.svg";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import StarRating from "@/components/StarRating";
import AlbumListItem from "@/components/albums/AlbumListItem";
import AlbumListItemSkeleton from "@/components/albums/AlbumListItemSkeleton";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Icon } from "@/components/ui/icon";
import { Image } from "@/components/ui/image";
import {
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
} from "@/components/ui/modal";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useAlbum, useArtist } from "@/hooks/openSubsonic/useBrowsing";
import {
  useSetRating,
  useStar,
  useUnstar,
} from "@/hooks/openSubsonic/useMediaAnnotation";
import { useCreateShare } from "@/hooks/openSubsonic/useSharing";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useImageColors from "@/hooks/useImageColors";
import type { Child } from "@/services/openSubsonic/types";
import useRecentPlays from "@/stores/recentPlays";
import { artworkUrl } from "@/utils/artwork";
import { format } from "@/utils/date";
import { loadingData } from "@/utils/loadingData";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { parse } from "date-fns";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ClipboardCheck,
  ClipboardIcon,
  Disc3,
  EllipsisVertical,
  Heart,
  ListPlus,
  Play,
  PlusCircle,
  Share2,
  Shuffle,
  Star,
  User,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);
const AnimatedBox = Animated.createAnimatedComponent(Box);
const AnimatedImage = Animated.createAnimatedComponent(Image);

export default function AlbumDetail() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [showRatingModal, setShowRatingModal] = useState<boolean>(false);
  const [clipboardText, setClipboardText] = useState("");
  const [clipoardCopyDone, setClipoardCopyDone] = useState(false);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const bottomSheetShareModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange: handleShareSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetShareModalRef);
  const doFavorite = useStar();
  const doUnfavorite = useUnstar();
  const doShare = useCreateShare();
  const doSetRating = useSetRating();
  const toast = useToast();
  const { data, isLoading, error } = useAlbum(id);
  const {
    data: discoverMoreData,
    isLoading: discoverMoreIsLoading,
    error: discoverMoreError,
  } = useArtist(data?.album?.artistId);
  const colors = useImageColors(artworkUrl(data?.album?.coverArt));
  const addRecentPlay = useRecentPlays.use.addRecentPlay();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const offsetY = useSharedValue(0);
  const headerStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        offsetY.value,
        [0, 220],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    };
  });
  const artworkStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: interpolate(
            offsetY.value,
            [0, 220],
            [1, 0.5],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });
  const scrollHandler = useAnimatedScrollHandler((event) => {
    offsetY.value = event.contentOffset.y;
  });
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
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.albums.favoriteSuccessMessage")}
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
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.albums.favoriteErrorMessage")}
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
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.albums.unfavoriteSuccessMessage")}
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
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.albums.unfavoriteErrorMessage")}
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
        onSuccess: (data) => {
          setClipboardText(data?.shares?.share[0]?.url);
          queryClient.invalidateQueries({ queryKey: ["shares"] });
          bottomSheetModalRef.current?.dismiss();
          bottomSheetShareModalRef.current?.present();

          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.albums.shareSuccessMessage")}
                </ToastDescription>
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
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.albums.shareErrorMessage")}
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
        coverArt: data?.album?.coverArt,
      });
    }
  };

  const handleMusicBrainzPress = async () => {
    bottomSheetModalRef.current?.dismiss();
    if (
      data?.album?.musicBrainzId &&
      (await Linking.canOpenURL(
        `https://musicbrainz.org/album/${data?.album?.musicBrainzId}`,
      ))
    ) {
      Linking.openURL(
        `https://musicbrainz.org/album/${data?.album?.musicBrainzId}`,
      );
    }
  };

  const handleLastFMPress = async () => {
    if (
      data?.album?.name &&
      data?.album?.artist &&
      (await Linking.canOpenURL(
        `https://www.last.fm/music/${encodeURIComponent(data?.album?.artist)}/${encodeURIComponent(data?.album?.name)}`,
      ))
    ) {
      Linking.openURL(
        `https://www.last.fm/music/${encodeURIComponent(data?.album?.artist)}/${encodeURIComponent(data?.album?.name)}`,
      );
    }
  };

  const handleRatingPress = () => {
    bottomSheetModalRef.current?.dismiss();
    setShowRatingModal(true);
  };

  const handleCloseRatingModal = () => setShowRatingModal(false);

  const handleRatingChange = (rating: number) => {
    if (!data?.album?.id) return;
    doSetRating.mutate(
      { id: data.album.id, rating },
      {
        onSuccess: () => {
          // queryClient.setQueryData(["album", data.album.id], {
          //   ...data.album,
          //   userRating: rating,
          // });
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

  useEffect(() => {
    if (clipoardCopyDone) {
      const timer = setTimeout(() => {
        setClipoardCopyDone(false);
      }, 1000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [clipoardCopyDone]);

  const handleCopyShareUrlPress = async () => {
    try {
      if (clipboardText) {
        await Clipboard.setStringAsync(clipboardText);
        setClipoardCopyDone(true);
        toast.show({
          placement: "top",
          duration: 3000,
          render: () => (
            <Toast action="success">
              <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
              <ToastDescription>
                {t("app.shared.shareUrlCopiedMessage")}
              </ToastDescription>
            </Toast>
          ),
        });
      }
    } catch (e) {
      console.error(e);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.shared.shareUrlErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  return (
    <Box className="h-full w-full">
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
              {data?.album?.name}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </AnimatedBox>
      <AnimatedFlashList
        onScroll={scrollHandler}
        contentContainerStyle={{
          paddingBottom: insets.bottom + bottomTabBarHeight,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
        data={data?.album?.song || loadingData(16)}
        renderItem={({ item, index }: { item: Child; index: number }) =>
          isLoading ? (
            <TrackListItemSkeleton
              index={index}
              showCoverArt={false}
              className="px-6"
            />
          ) : (
            <TrackListItem
              track={item}
              index={index}
              className="px-6"
              onPlayCallback={handleTrackPressCallback}
              showCoverArt={false}
            />
          )
        }
        ListHeaderComponent={() => (
          <LinearGradient
            colors={[
              (colors?.platform === "ios" ? colors.primary : colors?.vibrant) ||
                "#000",
              "#000",
            ]}
            locations={[0, 0.8]}
            className="px-6"
            style={{ paddingTop: insets.top }}
          >
            <HStack className="mt-6 items-start justify-between">
              <FadeOutScaleDown
                onPress={() => router.back()}
                className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
              >
                <ArrowLeft size={24} color={themeConfig.theme.colors.white} />
              </FadeOutScaleDown>
              {!data?.album?.coverArt ? (
                <Box className="w-[70%] aspect-square rounded-md bg-primary-600 items-center justify-center">
                  <Disc3 size={48} color={themeConfig.theme.colors.white} />
                </Box>
              ) : (
                <AnimatedImage
                  style={artworkStyle}
                  source={{
                    uri: artworkUrl(data?.album?.coverArt),
                  }}
                  className="w-[70%] aspect-square rounded-md"
                  alt="Album cover"
                />
              )}
              <Box className="w-10" />
            </HStack>
            <VStack>
              <HStack className="mt-5 items-center justify-between">
                <Heading numberOfLines={1} className="text-white" size="2xl">
                  {data?.album?.name}
                </Heading>
              </HStack>
              <HStack className="mt-4 items-center">
                {data?.album?.artistId ? (
                  <Image
                    source={{ uri: artworkUrl(data?.album?.artistId) }}
                    className="w-8 h-8 rounded-full aspect-square"
                    alt="Artist cover"
                  />
                ) : (
                  <Box className="w-8 h-8 rounded-full bg-primary-600 items-center justify-center">
                    <User size={16} color={themeConfig.theme.colors.white} />
                  </Box>
                )}
                <Text
                  className="ml-4 text-white text-md font-bold"
                  numberOfLines={1}
                >
                  {((data?.album?.artists?.length || 0) > 1 &&
                    data?.album?.artists?.map((artist) => (
                      <React.Fragment key={artist.id}>
                        <Link href={`/artists/${artist.id}`}>
                          {artist.name}
                        </Link>
                        {artist.id ===
                        data?.album?.artists[data?.album?.artists?.length - 1]
                          ?.id ? null : (
                          <Text>, </Text>
                        )}
                      </React.Fragment>
                    ))) || (
                      <Link href={`/artists/${data?.album?.artistId}`}>
                        {data?.album?.displayArtist}
                      </Link>
                    ) || (
                      <Link href={`/artists/${data?.album?.artistId}`}>
                        {data?.album?.artist}
                      </Link>
                    )}
                </Text>
              </HStack>
              <HStack className="mt-2 items-center">
                <Text className="text-primary-100">
                  {data?.album?.isCompilation ? "Compilation" : "Album"} ⦁{" "}
                  {data?.album?.originalReleaseDate &&
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
                  {data?.album?.starred ? (
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
            </VStack>
            {error && <ErrorDisplay error={error} />}
          </LinearGradient>
        )}
        ListFooterComponent={() => (
          <VStack className="my-6 px-6">
            <Text className="text-white font-bold">
              {`${t("app.shared.songCount", { count: data?.album?.songCount })} `}{" "}
              ⦁ {Math.round((data?.album?.duration || 0) / 60)} min
            </Text>
            {data?.album?.recordLabels?.map((recordLabel) => (
              <Text className="text-primary-100 text-sm" key={recordLabel.name}>
                © {recordLabel.name}
              </Text>
            ))}
            {discoverMoreData?.artist?.album && (
              <VStack>
                <HStack className="mt-6 mb-4 items-center justify-between">
                  <Heading numberOfLines={1} size="xl" className="text-white">
                    {t("app.albums.moreFromArtist", {
                      artist: discoverMoreData?.artist?.name,
                    })}
                  </Heading>
                  <FadeOutScaleDown
                    href={`/artists/${discoverMoreData?.artist?.id}/discography`}
                  >
                    <Text numberOfLines={1} className="text-gray-200">
                      See all
                    </Text>
                  </FadeOutScaleDown>
                </HStack>
                {discoverMoreError ? (
                  <ErrorDisplay error={discoverMoreError} />
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="mb-6"
                  >
                    {discoverMoreIsLoading ? (
                      loadingData(4).map((_, index) => (
                        <AlbumListItemSkeleton
                          key={`discover-more-${index}`}
                          index={index}
                          layout="horizontal"
                        />
                      ))
                    ) : (
                      <>
                        {discoverMoreData?.artist?.album
                          ?.filter((album) => album.id !== data?.album?.id)
                          ?.slice(0, 4)
                          .map((album, index) => (
                            <AlbumListItem
                              key={album.id}
                              album={album}
                              index={index}
                              layout="horizontal"
                            />
                          ))}
                      </>
                    )}
                  </ScrollView>
                )}
                {!discoverMoreIsLoading &&
                  !discoverMoreError &&
                  !discoverMoreData?.artist?.album?.length && <EmptyDisplay />}
              </VStack>
            )}
          </VStack>
        )}
        ListEmptyComponent={() => <EmptyDisplay />}
        // contentContainerStyle={{ paddingHorizontal: 24 }}
      />
      <BottomSheetModal
        ref={bottomSheetShareModalRef}
        onChange={handleShareSheetPositionChange}
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
              <FadeOutScaleDown
                className="flex-row gap-x-4 items-center justify-between flex-1  overflow-hidden"
                onPress={handleCopyShareUrlPress}
              >
                {clipoardCopyDone ? (
                  <ClipboardCheck
                    size={24}
                    color={themeConfig.theme.colors.emerald[500]}
                  />
                ) : (
                  <ClipboardIcon
                    size={24}
                    color={themeConfig.theme.colors.gray[200]}
                  />
                )}
                <Text
                  className="text-lg text-gray-200 py-1 px-3 bg-primary-900 rounded-xl  flex-1 grow"
                  ellipsizeMode="tail"
                  numberOfLines={1}
                >
                  {clipboardText}
                </Text>
              </FadeOutScaleDown>
            </HStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
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
              {data?.album?.coverArt ? (
                <Image
                  source={{ uri: artworkUrl(data?.album?.coverArt) }}
                  className="w-16 h-16 rounded-md aspect-square"
                  alt="Album cover"
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
                  {data?.album?.name}
                </Heading>
                <Text numberOfLines={1} className="text-md text-primary-100">
                  {data?.album?.artist}
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
                    {t("app.albums.addToPlaylist")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={handleGoToArtistPress}>
                <HStack className="items-center">
                  <User size={24} color={themeConfig.theme.colors.gray[200]} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.albums.goToArtist")}
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
                    {t("app.albums.addToQueue")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={handleRatingPress}>
                <HStack className="items-center">
                  <Star size={24} color={themeConfig.theme.colors.gray[200]} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.albums.rate")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={handleSharePress}>
                <HStack className="items-center">
                  <Share2
                    size={24}
                    color={themeConfig.theme.colors.gray[200]}
                  />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.albums.share")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              {data?.album?.musicBrainzId && (
                <FadeOutScaleDown onPress={handleMusicBrainzPress}>
                  <HStack className="items-center">
                    <MusicBrainz
                      width={24}
                      height={24}
                      fill={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.albums.musicBrainz")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
              {data?.album?.name && data?.album?.artist && (
                <FadeOutScaleDown onPress={handleLastFMPress}>
                  <HStack className="items-center">
                    <LastFM
                      width={24}
                      height={24}
                      fill={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.albums.lastFM")}
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
              {t("app.albums.rateModalTitle")}
            </Heading>
            <ModalCloseButton>
              <Icon as={X} size="md" className="color-white" />
            </ModalCloseButton>
          </ModalHeader>
          <ModalBody className="mb-0 pb-0">
            <StarRating
              value={data?.album?.userRating || 0}
              onChange={handleRatingChange}
            />
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
