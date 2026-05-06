import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
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
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LastFM from "@/assets/images/lastfm.svg";
import MusicBrainz from "@/assets/images/musicbrainz.svg";
import AlbumListItem from "@/components/albums/AlbumListItem";
import EmptyDisplay from "@/components/EmptyDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import StarRating from "@/components/StarRating";
import TrackListItem from "@/components/tracks/TrackListItem";
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
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useArtist } from "@/hooks/openSubsonic/useBrowsing";
import { useStarred2 } from "@/hooks/openSubsonic/useLists";
import {
  useSetRating,
  useStar,
  useUnstar,
} from "@/hooks/openSubsonic/useMediaAnnotation";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useImageColors from "@/hooks/useImageColors";
import { playTracks, togglePlayPause } from "@/services/player";
import useActivity from "@/stores/activity";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import useRecentPlays from "@/stores/recentPlays";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";

const AnimatedBox = Animated.createAnimatedComponent(Box);

export default function LikedSongs() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [showRatingModal, setShowRatingModal] = useState<boolean>(false);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const { data } = useArtist(id);
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
  const gradientPrimary =
    (colors?.platform === "ios" ? colors.primary : colors?.vibrant) || "#000";
  const gradientSecondary =
    (colors?.platform === "ios" ? colors.primary : colors?.darkVibrant) ||
    "#000";

  const offsetY = useSharedValue(0);
  const headerStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        offsetY.value,
        [0, 100],
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

  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const isPlayingFromList = !!(
    playingTrack && likedSongs.some((track) => track.id === playingTrack.id)
  );

  const handleTrackPressCallback = () => {
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

  const handlePlayPress = () => {
    if (isPlayingFromList) {
      togglePlayPause();
      return;
    }
    if (likedSongs.length === 0) return;
    playTracks(likedSongs.map(childToTrack), 0);
    handleTrackPressCallback();
  };

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
        onError: () => {
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
        onError: () => {
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
          colors={[gradientPrimary, gradientSecondary]}
          locations={[0, 0.7]}
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
              className="text-white font-bold text-center ml-6 truncate flex-1"
              size="lg"
            >
              {data?.artist?.name}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </AnimatedBox>
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingBottom: bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
        }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[gradientPrimary, "#000000"]}
          className="h-48"
          style={{ height: 192 }}
        >
          <Box
            className="bg-black/25 flex-1"
            style={{ paddingTop: insets.top }}
          >
            <VStack className="mt-6 px-6 items-start justify-between h-full -mb-12">
              <FadeOutScaleDown onPress={() => router.back()}>
                <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                  <ArrowLeft size={24} color={themeConfig.theme.colors.white} />
                </Box>
              </FadeOutScaleDown>
              <Heading
                numberOfLines={2}
                className="text-white mb-12 font-bold"
                size="xl"
              >
                {data?.artist?.name}
              </Heading>
            </VStack>
          </Box>
        </LinearGradient>
        <VStack className="px-6 bg-black">
          <Text className="text-primary-100 mt-4" numberOfLines={1}>
            {t("app.shared.songCount", { count: likedSongs.length })}
            {likedAlbums.length > 0 && (
              <>
                {" • "}
                {t("app.shared.albumCount", { count: likedAlbums.length })}
              </>
            )}
          </Text>
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
                  {isPlayingFromList && isPlaying ? (
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
          <Heading className="text-white mb-4" size="lg">
            {t("app.artists.likedSongs")}
          </Heading>
          {likedSongs.length === 0 ? (
            <EmptyDisplay />
          ) : (
            <Box className="-mt-6">
              {likedSongs.map((song, index) => (
                <TrackListItem
                  key={song.id}
                  track={song}
                  index={index}
                  trackList={likedSongs}
                  onPlayCallback={handleTrackPressCallback}
                />
              ))}
            </Box>
          )}
          {likedAlbums.length > 0 && (
            <>
              <Heading className="text-white mt-6 mb-4" size="lg">
                {t("app.artists.likedAlbums")}
              </Heading>
              <Box className="-mx-6">
                {likedAlbums.map((album, index) => (
                  <AlbumListItem key={album.id} album={album} index={index} />
                ))}
              </Box>
            </>
          )}
        </VStack>
      </Animated.ScrollView>
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
