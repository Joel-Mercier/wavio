import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Star from "lucide-react-native/dist/esm/icons/star.mjs";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import { useCallback, useMemo, useRef, useState } from "react";
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
import AnimatedHeart from "@/components/AnimatedHeart";
import AlbumListItem from "@/components/albums/AlbumListItem";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import EmptyDisplay from "@/components/EmptyDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import PlayPauseButton from "@/components/PlayPauseButton";
import RatingModal from "@/components/RatingModal";
import ShuffleToggle from "@/components/ShuffleToggle";
import TrackListItem from "@/components/tracks/TrackListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { useArtist } from "@/hooks/backend/useBrowsing";
import { useStarred2 } from "@/hooks/backend/useLists";
import {
  useSetRating,
  useStar,
  useUnstar,
} from "@/hooks/backend/useMediaAnnotation";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import { useCapabilities } from "@/hooks/useCapabilities";
import useImageColors from "@/hooks/useImageColors";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import { playTracks, togglePlayPause } from "@/services/player";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import useQueue, { type QueueSource } from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";
import { logError } from "@/utils/log";
import { goBackOrHome } from "@/utils/navigation";

const AnimatedBox = Animated.createAnimatedComponent(Box);
const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;

export default function LikedSongs() {
  const [white, gray200, black] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-200",
    "--color-black",
  ]) as string[];
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [showRatingModal, setShowRatingModal] = useState<boolean>(false);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
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
  const capabilities = useCapabilities();
  const isOnline = useIsOnline();
  const addRecentPlay = useRecentPlays((store) => store.addRecentPlay);
  const colors = useImageColors(artworkUrl(data?.artist?.coverArt));
  const topColor =
    (colors?.platform === "ios" ? colors.primary : colors?.muted) || black;
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
  const trackIdSet = useMemo(
    () => new Set(likedSongs.map((t) => t.id)),
    [likedSongs],
  );
  const isPlayingFromList = !!(playingTrack && trackIdSet.has(playingTrack.id));

  const handleTrackPressCallback = () => {
    if (data?.artist) {
      addRecentPlay({
        id,
        title: data.artist.name,
        type: "artist",
        coverArt: data.artist.coverArt,
      });
    }
  };

  const likedSongsSource = useMemo<QueueSource>(
    () =>
      data?.artist
        ? { type: "likedSongs", name: data.artist.name }
        : { type: "likedSongs", name: "" },
    [data?.artist],
  );
  const handlePlayPress = () => {
    if (isPlayingFromList) {
      togglePlayPause();
      return;
    }
    if (likedSongs.length === 0) return;
    playTracks(likedSongs.map(childToTrack), 0, {
      shuffleFromRandom: true,
      source: likedSongsSource,
    });
    handleTrackPressCallback();
  };

  const shuffle = useQueue((store) => store.shuffle);
  const setShuffle = useQueue((store) => store.setShuffle);
  const handleShufflePress = () => {
    setShuffle(!shuffle);
  };

  const handleTrackPress = useTrackListPress(likedSongs, likedSongsSource);

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

  // Both sections render through a single FlashList — two vertical lists (or a
  // list inside a ScrollView) would nest virtualization and render every row.
  // Songs, the "Liked Albums" divider, and albums are flattened into one typed
  // array; getItemType keeps a separate recycle pool per shape.
  type Row =
    | { type: "song"; song: (typeof likedSongs)[number]; index: number }
    | { type: "songsEmpty" }
    | { type: "albumsHeader" }
    | { type: "album"; album: (typeof likedAlbums)[number]; index: number };

  const rows = useMemo<Row[]>(() => {
    const result: Row[] = [];
    if (likedSongs.length === 0) {
      result.push({ type: "songsEmpty" });
    } else {
      likedSongs.forEach((song, index) => {
        result.push({ type: "song", song, index });
      });
    }
    if (likedAlbums.length > 0) {
      result.push({ type: "albumsHeader" });
      likedAlbums.forEach((album, index) => {
        result.push({ type: "album", album, index });
      });
    }
    return result;
  }, [likedSongs, likedAlbums]);

  return (
    <Box className="h-full bg-black">
      <AnimatedBox
        className="w-full z-10 absolute top-0 left-0 right-0"
        style={[headerStyle]}
      >
        <LinearGradient colors={[topColor, black]} locations={[0, 0.7]}>
          <HStack
            className="items-center justify-between pb-4 px-6 bg-black/25"
            style={{ paddingTop: insets.top + 16 }}
          >
            <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
              <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                <ArrowLeft size={24} color={white} />
              </Box>
            </FadeOutScaleDown>
            <Heading
              numberOfLines={1}
              className="text-white font-bold text-center truncate flex-1"
              size="lg"
            >
              {data?.artist?.name}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </AnimatedBox>
      <AnimatedFlashList
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingBottom: screenBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
        data={rows}
        keyExtractor={(item: Row) =>
          item.type === "song"
            ? item.song.id
            : item.type === "album"
              ? `album-${item.album.id}`
              : item.type
        }
        getItemType={(item: Row) => item.type}
        renderItem={({ item }: { item: Row }) => {
          switch (item.type) {
            case "song":
              return (
                <TrackListItem
                  track={item.song}
                  index={item.index}
                  className="px-6"
                  onPress={handleTrackPress}
                  onPlayCallback={handleTrackPressCallback}
                />
              );
            case "songsEmpty":
              return <EmptyDisplay />;
            case "albumsHeader":
              return (
                <Heading className="text-white px-6 mt-6 mb-4" size="lg">
                  {t("app.artists.likedAlbums")}
                </Heading>
              );
            case "album":
              return <AlbumListItem album={item.album} index={item.index} />;
          }
        }}
        ListHeaderComponent={
          <>
            <LinearGradient
              colors={[topColor, black]}
              className="h-48"
              style={{ height: 192 }}
            >
              <Box
                className="bg-black/25 flex-1"
                style={{ paddingTop: insets.top }}
              >
                <VStack className="mt-6 px-6 items-start justify-between h-full -mb-12">
                  <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
                    <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                      <ArrowLeft size={24} color={white} />
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
                    isPlaying={isPlayingFromList && isPlaying}
                    onPress={handlePlayPress}
                    size={48}
                    iconSize={24}
                    color={white}
                    className="bg-emerald-500"
                  />
                </HStack>
              </HStack>
              <Heading className="text-white mb-4" size="lg">
                {t("app.artists.likedSongs")}
              </Heading>
            </VStack>
          </>
        }
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
