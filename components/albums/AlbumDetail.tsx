import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { parse } from "date-fns/parse";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import PlusCircle from "lucide-react-native/dist/esm/icons/circle-plus.mjs";
import ClipboardIcon from "lucide-react-native/dist/esm/icons/clipboard.mjs";
import ClipboardCheck from "lucide-react-native/dist/esm/icons/clipboard-check.mjs";
import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Heart from "lucide-react-native/dist/esm/icons/heart.mjs";
import ListPlus from "lucide-react-native/dist/esm/icons/list-plus.mjs";
import Pause from "lucide-react-native/dist/esm/icons/pause.mjs";
import Play from "lucide-react-native/dist/esm/icons/play.mjs";
import Share2 from "lucide-react-native/dist/esm/icons/share-2.mjs";
import Shuffle from "lucide-react-native/dist/esm/icons/shuffle.mjs";
import Star from "lucide-react-native/dist/esm/icons/star.mjs";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
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
import { Uniwind } from "uniwind";
import LastFM from "@/assets/images/lastfm.svg";
import MusicBrainz from "@/assets/images/musicbrainz.svg";
import AlbumListItem from "@/components/albums/AlbumListItem";
import AlbumListItemSkeleton from "@/components/albums/AlbumListItemSkeleton";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import StarRating from "@/components/StarRating";
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
import { useAlbum, useArtist } from "@/hooks/backend/useBrowsing";
import {
  useSetRating,
  useStar,
  useUnstar,
} from "@/hooks/backend/useMediaAnnotation";
import { useCreateShare } from "@/hooks/backend/useSharing";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { useCapabilities } from "@/hooks/useCapabilities";
import useImageColors from "@/hooks/useImageColors";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import useActivity from "@/stores/activity";
import useQueue from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";
import { format } from "@/utils/date";
import { loadingData } from "@/utils/loadingData";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;
const AnimatedBox = Animated.createAnimatedComponent(Box);
const AnimatedImage = Animated.createAnimatedComponent(Image);

export default function AlbumDetail() {
  const [white, emerald500, gray200] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
    "--color-gray-200",
  ]) as string[];
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
  const capabilities = useCapabilities();
  const toast = useToast();
  const { data, isLoading, error } = useAlbum(id);
  const {
    data: discoverMoreData,
    isLoading: discoverMoreIsLoading,
    error: discoverMoreError,
  } = useArtist(data?.album?.artistId ?? "");
  const colors = useImageColors(artworkUrl(data?.album?.coverArt));
  const addRecentPlay = useRecentPlays((store) => store.addRecentPlay);
  const recordActivity = useActivity((store) => store.recordActivity);
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
    router.navigate(`/artists/${data?.album.artists?.[0].id}`);
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

  const handleAddToQueuePress = () => {
    const songs = data?.album?.song;
    if (!songs || songs.length === 0) return;
    const tracks = songs.map(childToTrack);
    useQueue.getState().enqueueEnd(tracks);
    bottomSheetModalRef.current?.dismiss();
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {t("app.shared.addedToQueueMessage", { count: tracks.length })}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  const handleSharePress = () => {
    doShare.mutate(
      { id },
      {
        onSuccess: (data) => {
          setClipboardText(data?.shares?.share?.[0]?.url ?? "");
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

  const handleAddAllToFavoritesPress = async () => {
    bottomSheetModalRef.current?.dismiss();
    const songs = data?.album?.song;
    if (!songs || songs.length === 0) return;
    try {
      for (const song of songs) {
        await doFavorite.mutateAsync({ id: song.id });
      }
      queryClient.invalidateQueries({ queryKey: ["starred2"] });
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.albums.addAllToFavoritesSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    } catch (e) {
      console.error(e);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.albums.addAllToFavoritesErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const albumTracks = data?.album?.song;
  const isPlayingFromList = !!(
    playingTrack && albumTracks?.some((track) => track.id === playingTrack.id)
  );
  const handlePlayPress = () => {
    if (isPlayingFromList) {
      togglePlayPause();
      return;
    }
    if (!albumTracks || albumTracks.length === 0) return;
    playTracks(albumTracks.map(childToTrack), 0);
    if (data?.album) {
      addRecentPlay({
        id,
        title: data.album.name,
        type: "album",
        coverArt: data.album.coverArt,
      });
      recordActivity({
        id,
        title: data.album.name,
        type: "album",
        coverArt: data.album.coverArt,
        artist: data.album.artist,
      });
    }
  };

  const handleTrackPressCallback = () => {
    if (data?.album) {
      addRecentPlay({
        id,
        title: data?.album.name,
        type: "album",
        coverArt: data?.album?.coverArt,
      });
      recordActivity({
        id,
        title: data.album.name,
        type: "album",
        coverArt: data.album.coverArt,
        artist: data.album.artist,
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
            (colors?.platform === "ios"
              ? colors.primary
              : colors?.lightMuted) || "#000",
            (colors?.platform === "ios" ? colors.primary : colors?.darkMuted) ||
              "#000",
          ]}
        >
          <HStack
            className="items-center justify-between pb-4 px-6 bg-black/25"
            style={{ paddingTop: insets.top + 16 }}
          >
            <FadeOutScaleDown onPress={() => router.back()}>
              <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                <ArrowLeft size={24} color={white} />
              </Box>
            </FadeOutScaleDown>
            <Heading
              numberOfLines={1}
              className="text-white text-center font-bold truncate flex-1"
              size="lg"
            >
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
              trackList={data?.album?.song}
              className="px-6"
              onPlayCallback={handleTrackPressCallback}
              showCoverArt={false}
            />
          )
        }
        ListHeaderComponent={() => (
          <LinearGradient
            colors={[
              (colors?.platform === "ios"
                ? colors.primary
                : colors?.lightMuted) || "#000",
              "#000",
            ]}
            locations={[0, 0.8]}
            className="px-6"
            style={{
              paddingTop: insets.top,
              paddingHorizontal: 24,
            }}
          >
            <HStack className="mt-6 items-start justify-between">
              <FadeOutScaleDown
                onPress={() => router.back()}
                className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
              >
                <ArrowLeft size={24} color={white} />
              </FadeOutScaleDown>
              {!data?.album?.coverArt ? (
                <Box className="w-[70%] aspect-square rounded-md bg-primary-600 items-center justify-center">
                  <Disc3 size={48} color={white} />
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
                <Heading numberOfLines={2} className="text-white" size="2xl">
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
                    <User size={16} color={white} />
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
                        data?.album?.artists?.[
                          (data?.album?.artists?.length ?? 0) - 1
                        ]?.id ? null : (
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
                  {data?.album?.releaseTypes &&
                  data.album.releaseTypes.length > 0
                    ? data.album.releaseTypes
                        .map((type) =>
                          type.toLowerCase() === "ep"
                            ? type.toUpperCase()
                            : type.charAt(0).toUpperCase() +
                              type.slice(1).toLowerCase(),
                        )
                        .join(" · ")
                    : data?.album?.isCompilation
                      ? "Compilation"
                      : "Album"}{" "}
                  ⦁{" "}
                  {data?.album?.originalReleaseDate?.day &&
                  data?.album.originalReleaseDate?.month &&
                  data?.album.originalReleaseDate?.year
                    ? format(
                        parse(
                          `${data?.album.originalReleaseDate?.day}/${data?.album.originalReleaseDate?.month}/${data?.album.originalReleaseDate?.year}`,
                          "d/M/yyyy",
                          new Date(),
                        ),
                        "dd MMM yyyy",
                      )
                    : data?.album?.year}
                </Text>
              </HStack>
              <HStack className="mt-4 items-center justify-between">
                <HStack className="items-center gap-x-4">
                  {data?.album?.starred ? (
                    <FadeOutScaleDown onPress={handleUnfavoritePress}>
                      <Heart color={emerald500} fill={emerald500} />
                    </FadeOutScaleDown>
                  ) : (
                    <FadeOutScaleDown onPress={handleFavoritePress}>
                      <Heart color={white} />
                    </FadeOutScaleDown>
                  )}
                  <FadeOutScaleDown onPress={handlePresentModalPress}>
                    <EllipsisVertical color={white} />
                  </FadeOutScaleDown>
                </HStack>
                <HStack className="items-center gap-x-4">
                  <FadeOutScaleDown>
                    <Shuffle color={white} />
                  </FadeOutScaleDown>
                  <FadeOutScaleDown onPress={handlePlayPress}>
                    <Box className="w-12 h-12 rounded-full bg-emerald-500 items-center justify-center">
                      {isPlayingFromList && isPlaying ? (
                        <Pause color={white} fill={white} />
                      ) : (
                        <Play color={white} fill={white} />
                      )}
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
              {`${t("app.shared.songCount", { count: data?.album?.songCount ?? 0 })} `}{" "}
              ⦁ {Math.round((data?.album?.duration || 0) / 60)} min
            </Text>
            {data?.album?.recordLabels?.map((recordLabel) => (
              <Text className="text-primary-100 text-sm" key={recordLabel.name}>
                © {recordLabel.name}
              </Text>
            ))}
            {(() => {
              const moreAlbums = discoverMoreData?.artist?.album
                ?.filter((album) => album.id !== data?.album?.id)
                ?.slice(0, 4);
              if (
                !discoverMoreIsLoading &&
                !discoverMoreError &&
                !moreAlbums?.length
              ) {
                return null;
              }
              return (
                <VStack>
                  <HStack className="mt-6 mb-4 items-center justify-between gap-x-4">
                    <Heading
                      numberOfLines={1}
                      size="xl"
                      className="text-white flex-1 truncate"
                    >
                      {t("app.albums.moreFromArtist", {
                        artist: discoverMoreData?.artist?.name,
                      })}
                    </Heading>
                    <FadeOutScaleDown
                      href={{
                        pathname: "/artists/[id]/discography",
                        params: {
                          id: discoverMoreData?.artist?.id ?? "",
                          name: t("app.albums.moreFromArtist", {
                            artist: discoverMoreData?.artist?.name,
                          }),
                        },
                      }}
                    >
                      <Text numberOfLines={1} className="text-gray-200">
                        {t("app.albums.seeAll")}
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
                      {discoverMoreIsLoading
                        ? loadingData(4).map((_, index) => (
                            <AlbumListItemSkeleton
                              key={`discover-more-${index}`}
                              index={index}
                              layout="horizontal"
                            />
                          ))
                        : moreAlbums?.map((album, index) => (
                            <AlbumListItem
                              key={album.id}
                              album={album}
                              index={index}
                              layout="horizontal"
                            />
                          ))}
                    </ScrollView>
                  )}
                </VStack>
              );
            })()}
          </VStack>
        )}
        ListEmptyComponent={() => <EmptyDisplay />}
        // contentContainerStyle={{ paddingHorizontal: 24 }}
        showsVerticalScrollIndicator={false}
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
                  <ClipboardCheck size={24} color={emerald500} />
                ) : (
                  <ClipboardIcon size={24} color={gray200} />
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
                  <Disc3 size={24} color={white} />
                </Box>
              )}
              <VStack className="ml-4 flex-1">
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
              <FadeOutScaleDown onPress={handleAddAllToFavoritesPress}>
                <HStack className="items-center">
                  <Heart size={24} color={gray200} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.albums.addAllToFavorites")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={handleAddToPlaylistPress}>
                <HStack className="items-center">
                  <PlusCircle size={24} color={gray200} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.albums.addToPlaylist")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={handleGoToArtistPress}>
                <HStack className="items-center">
                  <User size={24} color={gray200} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.albums.goToArtist")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={handleAddToQueuePress}>
                <HStack className="items-center">
                  <ListPlus size={24} color={gray200} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.albums.addToQueue")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              {capabilities.setRating && (
                <FadeOutScaleDown onPress={handleRatingPress}>
                  <HStack className="items-center justify-between">
                    <HStack className="items-center">
                      <Star size={24} color={gray200} />
                      <Text className="ml-4 text-lg text-gray-200">
                        {t("app.albums.rate")}
                      </Text>
                    </HStack>
                    <HStack className="items-center">
                      {!!data?.album?.userRating && (
                        <Text className="ml-4 text-lg text-emerald-500">
                          {data?.album?.userRating}/5
                        </Text>
                      )}
                    </HStack>
                  </HStack>
                </FadeOutScaleDown>
              )}
              {capabilities.sharing && (
                <FadeOutScaleDown onPress={handleSharePress}>
                  <HStack className="items-center">
                    <Share2 size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.albums.share")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
              {data?.album?.musicBrainzId && (
                <FadeOutScaleDown onPress={handleMusicBrainzPress}>
                  <HStack className="items-center">
                    <MusicBrainz width={24} height={24} fill={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.albums.musicBrainz")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
              {data?.album?.name && data?.album?.artist && (
                <FadeOutScaleDown onPress={handleLastFMPress}>
                  <HStack className="items-center">
                    <LastFM width={24} height={24} fill={gray200} />
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
