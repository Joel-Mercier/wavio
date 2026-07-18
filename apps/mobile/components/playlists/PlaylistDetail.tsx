import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowDown from "lucide-react-native/dist/esm/icons/arrow-down.mjs";
import ArrowDownUp from "lucide-react-native/dist/esm/icons/arrow-down-up.mjs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import ArrowUp from "lucide-react-native/dist/esm/icons/arrow-up.mjs";
import ClipboardIcon from "lucide-react-native/dist/esm/icons/clipboard.mjs";
import ClipboardCheck from "lucide-react-native/dist/esm/icons/clipboard-check.mjs";
import Clock from "lucide-react-native/dist/esm/icons/clock.mjs";
import Download from "lucide-react-native/dist/esm/icons/download.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import ListOrdered from "lucide-react-native/dist/esm/icons/list-ordered.mjs";
import ListPlus from "lucide-react-native/dist/esm/icons/list-plus.mjs";
import ListStart from "lucide-react-native/dist/esm/icons/list-start.mjs";
import Pencil from "lucide-react-native/dist/esm/icons/pencil.mjs";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import Share2 from "lucide-react-native/dist/esm/icons/share-2.mjs";
import Wand2 from "lucide-react-native/dist/esm/icons/wand-sparkles.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import DownloadedBadge from "@/components/DownloadedBadge";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import PlayPauseButton from "@/components/PlayPauseButton";
import ShuffleToggle from "@/components/ShuffleToggle";
import TrackListItem from "@/components/tracks/TrackListItem";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import {
  useDeletePlaylist,
  usePlaylist,
  useUpdatePlaylist,
} from "@/hooks/backend/usePlaylists";
import { useCreateShare } from "@/hooks/backend/useSharing";
import { useSmartPlaylist } from "@/hooks/navidrome/useSmartPlaylists";
import {
  type DownloadCollectionMeta,
  useCollectionDownload,
  useOfflinePlaylist,
} from "@/hooks/offline";
import { useIsPlaying } from "@/hooks/player";
import { useCapabilities } from "@/hooks/useCapabilities";
import useImageColors from "@/hooks/useImageColors";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import useApp from "@/stores/app";
import useAuth from "@/stores/auth";
import usePlaylists from "@/stores/playlists";
import useQueue, { type QueueSource } from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";
import { formatDuration } from "@/utils/date";
import { loadingData } from "@/utils/loadingData";
import { logError } from "@/utils/log";
import { goBackOrHome } from "@/utils/navigation";
import { orderPlaylistEntries } from "@/utils/playlistOrder";
import TrackListItemSkeleton from "../tracks/TrackListItemSkeleton";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;
const AnimatedBox = Animated.createAnimatedComponent(Box);

const SKELETON_DATA = loadingData(16);
const EMPTY_DATA: Child[] = [];
// A playlist can contain the same track more than once, so the track id alone
// isn't unique — pair it with the row index to keep FlashList keys distinct.
const keyExtractor = (item: Child, index: number) =>
  `${item.id ?? "row"}-${index}`;

export default function PlaylistDetail() {
  const [white, emerald500, gray200, red500, black, gray400] =
    Uniwind.getCSSVariable([
      "--color-white",
      "--color-emerald-500",
      "--color-gray-200",
      "--color-red-500",
      "--color-black",
      "--color-gray-400",
    ]) as string[];
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const setPlaylistSort = usePlaylists((store) => store.setPlaylistSort);
  const playlistSorts = usePlaylists((store) => store.playlistSorts);
  const sort = playlistSorts[id] ?? "addedAtAsc";
  const getPlaylistTrackOrder = usePlaylists(
    (store) => store.getPlaylistTrackOrder,
  );
  const [showAlertDialog, setShowAlertDialog] = useState<boolean>(false);
  const [clipboardText, setClipboardText] = useState("");
  const [clipoardCopyDone, setClipoardCopyDone] = useState(false);
  const isWideLayout = useApp((s) => s.isWideLayout);
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetShareModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetSortModalRef = useRef<BottomSheetModal>(null);
  const { data: serverPlaylistData, isLoading, error } = usePlaylist(id);
  const offlinePlaylistData = useOfflinePlaylist(id);
  // Offline (or before the server query resolves) fall back to the downloaded
  // collection so a saved playlist stays browsable after a logout clears the
  // React Query cache.
  const playlistData = serverPlaylistData ?? offlinePlaylistData;
  const hasNavidromeNative = useAuth((s) => s.hasNavidromeNative);
  const { data: ndPlaylist } = useSmartPlaylist(hasNavidromeNative ? id : null);
  const isSmartPlaylist = !!ndPlaylist?.rules;
  const doDeletePlaylist = useDeletePlaylist();
  const doUpdatePlaylist = useUpdatePlaylist();
  const doShare = useCreateShare();
  const capabilities = useCapabilities();
  const isOnline = useIsOnline();
  const addRecentPlay = useRecentPlays((store) => store.addRecentPlay);
  const colors = useImageColors(artworkUrl(playlistData?.playlist?.coverArt));
  const topColor =
    (colors?.platform === "ios" ? colors.primary : colors?.muted) || black;
  const offsetY = useSharedValue(0);
  const headerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      offsetY.value,
      [0, 220],
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

  const handleCloseAlertDialog = () => setShowAlertDialog(false);

  const handlePlaylistUpdatePress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.navigate(`/playlists/${id}/edit`);
  };

  const handlePlaylistReorderPress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.navigate(`/playlists/${id}/reorder`);
  };

  const handleEditRulesPress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.navigate(`/playlists/${id}/edit-rules`);
  };

  const handlePlayNextPress = () => {
    const entries = playlistData?.playlist?.entry;
    if (!entries || entries.length === 0) return;
    const tracks = entries.map(childToTrack);
    useQueue.getState().enqueueNext(tracks);
    bottomSheetModalRef.current?.dismiss();
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {t("app.shared.addedToPlayNextMessage", { count: tracks.length })}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  const handleAddToQueuePress = () => {
    const entries = playlistData?.playlist?.entry;
    if (!entries || entries.length === 0) return;
    const tracks = entries.map(childToTrack);
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

  const handlePlaylistDeletePress = () => {
    bottomSheetModalRef.current?.dismiss();
    doDeletePlaylist.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["playlists"] });
          goBackOrHome(router);
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.playlists.deletePlaylistSuccessMessage")}
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
                  {t("app.playlists.deletePlaylistErrorMessage")}
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
                  {t("app.playlists.sharePlaylistSuccessMessage")}
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
                  {t("app.playlists.sharePlaylistErrorMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const isPlaying = useIsPlaying();

  const handleTrackPressCallback = useCallback(() => {
    if (playlistData?.playlist) {
      addRecentPlay({
        id,
        title: playlistData?.playlist.name,
        type: "playlist",
        coverArt: playlistData?.playlist?.coverArt,
      });
    }
  }, [playlistData?.playlist, id, addRecentPlay]);

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
      logError(e);
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

  const handlePresentSortModalPress = useCallback(() => {
    bottomSheetSortModalRef.current?.present();
  }, []);

  const handleSortPress = (
    type: "addedAtAsc" | "addedAtDesc" | "alphabeticalAsc" | "alphabeticalDesc",
  ) => {
    bottomSheetSortModalRef.current?.dismiss();
    setPlaylistSort(id, type);
  };

  const data = useMemo(() => {
    if (
      !playlistData ||
      !playlistData?.playlist ||
      !playlistData?.playlist.entry
    ) {
      return null;
    }
    const newData = [...playlistData.playlist.entry];
    const storedOrder = getPlaylistTrackOrder(id);

    if (storedOrder && sort === "addedAtAsc") {
      return orderPlaylistEntries(newData, storedOrder);
    }

    if (sort === "addedAtAsc") {
      return newData;
    }
    if (sort === "addedAtDesc") {
      return newData.reverse();
    }
    if (sort === "alphabeticalAsc") {
      return newData.sort((a, b) => {
        return (a?.sortName || a.title).localeCompare(b?.sortName || b.title);
      });
    }
    if (sort === "alphabeticalDesc") {
      return newData.sort((a, b) => {
        return (b?.sortName || b.title).localeCompare(a?.sortName || a.title);
      });
    }
  }, [playlistData, sort, id, getPlaylistTrackOrder]);

  const handleDeleteFromPlaylistPress = useCallback(
    (displayIndex: string) => {
      const entries = playlistData?.playlist?.entry ?? [];
      const item = data?.[Number(displayIndex)];
      const serverIndex = item ? entries.indexOf(item) : -1;
      if (serverIndex < 0) return;
      doUpdatePlaylist.mutate(
        { id, songIndexToRemove: [String(serverIndex)] },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["playlist", id] });
            queryClient.invalidateQueries({ queryKey: ["playlists"] });
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="success">
                  <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                  <ToastDescription>
                    {t("app.playlists.removeTrackSuccessMessage")}
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
                    {t("app.playlists.removeTrackErrorMessage")}
                  </ToastDescription>
                </Toast>
              ),
            });
          },
        },
      );
    },
    [
      data,
      playlistData?.playlist?.entry,
      doUpdatePlaylist.mutate,
      id,
      queryClient,
      toast,
      t,
    ],
  );

  const queueSource = useQueue((store) => store.source);
  const isActiveSource =
    queueSource?.type === "playlist" && queueSource.id === id;

  const isLoadingRows = !playlistData;
  const playlistSource = useMemo<QueueSource>(
    () =>
      playlistData?.playlist
        ? {
            type: "playlist",
            name: playlistData.playlist.name,
            id: playlistData.playlist.id,
            coverArt: playlistData.playlist.coverArt,
          }
        : null,
    [playlistData?.playlist],
  );
  const handleTrackPress = useTrackListPress(data, playlistSource);
  const playlistMeta = useMemo<DownloadCollectionMeta | undefined>(
    () =>
      playlistData?.playlist
        ? {
            id,
            kind: "playlist",
            name: playlistData.playlist.name,
            coverArt: playlistData.playlist.coverArt,
            owner: playlistData.playlist.owner,
          }
        : undefined,
    [id, playlistData?.playlist],
  );
  const playlistDownload = useCollectionDownload(
    playlistData?.playlist?.entry,
    playlistMeta,
  );

  const handleSaveOfflinePress = async () => {
    bottomSheetModalRef.current?.dismiss();
    try {
      await playlistDownload.saveAll();
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.shared.offline.saveSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    } catch (error) {
      logError("Error saving playlist for offline:", error);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.shared.offline.saveErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  const handleRemoveOfflinePress = async () => {
    bottomSheetModalRef.current?.dismiss();
    try {
      await playlistDownload.removeAll();
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.shared.offline.removeSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    } catch (error) {
      logError("Error removing playlist offline downloads:", error);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.shared.offline.removeErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };
  const renderRow = useCallback(
    ({ item, index }: { item: Child; index: number }) =>
      isLoadingRows ? (
        <TrackListItemSkeleton index={index} className="px-6" />
      ) : (
        <TrackListItem
          track={item}
          index={index}
          onPress={handleTrackPress}
          handleRemoveFromPlaylist={handleDeleteFromPlaylistPress}
          onPlayCallback={handleTrackPressCallback}
          className="px-6"
        />
      ),
    [
      isLoadingRows,
      handleTrackPress,
      handleDeleteFromPlaylistPress,
      handleTrackPressCallback,
    ],
  );
  const handlePlayPress = () => {
    if (isActiveSource) {
      togglePlayPause();
      return;
    }
    if (!data || data.length === 0) return;
    playTracks(data.map(childToTrack), 0, {
      shuffleFromRandom: true,
      source: playlistSource,
    });
    if (playlistData?.playlist) {
      addRecentPlay({
        id,
        title: playlistData.playlist.name,
        type: "playlist",
        coverArt: playlistData.playlist.coverArt,
      });
    }
  };

  const shuffle = useQueue((store) => store.shuffle);
  const setShuffle = useQueue((store) => store.setShuffle);
  const handleShufflePress = () => {
    setShuffle(!shuffle);
  };

  return (
    <Box className="h-full">
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
              className="text-white font-bold text-center truncate flex-1"
              size="lg"
            >
              {playlistData?.playlist.name}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </AnimatedBox>
      <AnimatedFlashList
        onScroll={scrollHandler}
        data={!playlistData ? SKELETON_DATA : data || EMPTY_DATA}
        keyExtractor={keyExtractor}
        renderItem={renderRow}
        ListEmptyComponent={!playlistData ? null : <EmptyDisplay />}
        ListHeaderComponent={
          <LinearGradient
            colors={[topColor, black]}
            locations={[0, 0.8]}
            className="px-6"
            style={{
              paddingTop: insets.top,
              paddingHorizontal: 24,
            }}
          >
            <HStack className="mt-6 items-start justify-between">
              <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
                <ArrowLeft size={24} color={white} />
              </FadeOutScaleDown>
              {/* https://github.com/navidrome/navidrome/issues/406 */}
              <AnimatedBox
                style={artworkStyle}
                className={
                  isWideLayout
                    ? "w-[45%] aspect-square"
                    : "w-[70%] aspect-square"
                }
              >
                <ImageWithFallback
                  source={
                    playlistData?.playlist?.coverArt
                      ? { uri: artworkUrl(playlistData?.playlist?.coverArt) }
                      : undefined
                  }
                  className="w-full h-full aspect-square rounded-md"
                  alt="Playlist cover"
                  fallback={
                    <Box className="w-full h-full aspect-square rounded-md bg-primary-600 items-center justify-center">
                      <ListMusic size={48} color={white} />
                    </Box>
                  }
                />
              </AnimatedBox>

              <Box className="w-6" />
            </HStack>
            <VStack>
              <VStack className="mt-5">
                <Heading numberOfLines={2} className="text-white" size="2xl">
                  {playlistData?.playlist.name}
                </Heading>
                {playlistData?.playlist.comment && (
                  <Text className="text-md text-primary-100 mt-2">
                    {playlistData?.playlist.comment}
                  </Text>
                )}
              </VStack>
              {playlistData?.playlist?.owner && (
                <FadeOutScaleDown
                  onPress={() =>
                    router.navigate(`/profile/${playlistData?.playlist?.owner}`)
                  }
                >
                  <HStack className="mt-4 mb-2 items-center">
                    <Avatar size="sm" className="bg-primary-400 mr-3 w-8 h-8">
                      <AvatarFallbackText>
                        {playlistData?.playlist?.owner}
                      </AvatarFallbackText>
                    </Avatar>
                    <Text
                      className="text-white text-md font-bold"
                      numberOfLines={1}
                    >
                      {playlistData?.playlist?.owner}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
              <HStack className="mt-2 items-center gap-x-1">
                <Clock color={"#808080"} size={16} />
                <Text className="ml-2 text-primary-100">
                  {formatDuration(playlistData?.playlist.duration || 0)}
                </Text>
              </HStack>
              <HStack className="mt-4 items-center justify-between">
                <HStack className="items-center gap-x-4">
                  <FadeOutScaleDown onPress={handlePresentSortModalPress}>
                    <HStack className="items-center gap-x-2">
                      {sort.endsWith("Asc") && (
                        <ArrowUp size={16} color={white} />
                      )}
                      {sort.endsWith("Desc") && (
                        <ArrowDown size={16} color={white} />
                      )}
                      {!sort.endsWith("Asc") && !sort.endsWith("Desc") && (
                        <ArrowDownUp size={16} color={white} />
                      )}
                      <Text className="text-white font-bold">
                        {sort.startsWith("addedAt")
                          ? t("app.library.recentSort")
                          : t("app.library.alphabeticalSort")}
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
                  {playlistDownload.status === "downloading" ? (
                    <Download size={24} color={gray400} />
                  ) : playlistDownload.status === "all" ? (
                    <FadeOutScaleDown onPress={handleRemoveOfflinePress}>
                      <DownloadedBadge size={24} />
                    </FadeOutScaleDown>
                  ) : (
                    <FadeOutScaleDown
                      onPress={handleSaveOfflinePress}
                      disabled={!isOnline}
                    >
                      <Box className="size-6 rounded-full border-2 border-gray-200 items-center justify-center">
                        <ArrowDown size={16} color={gray200} />
                      </Box>
                    </FadeOutScaleDown>
                  )}
                  <FadeOutScaleDown
                    testID="playlist-menu-button"
                    onPress={handlePresentModalPress}
                  >
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
                  />
                </HStack>
              </HStack>
              <FadeOutScaleDown
                href={{
                  pathname: "/playlists/[id]/search",
                  params: { id, sort },
                }}
                className="my-4"
              >
                <HStack className="px-4 gap-x-4 h-10 rounded-lg bg-primary-600 items-center">
                  <Search
                    size={20}
                    color={"rgb(128, 128, 128)"}
                    className="text-primary-100"
                  />
                  <Text className="text-primary-100 text-sm">
                    {t("app.playlists.searchPlaceholder")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            </VStack>
            {error && <ErrorDisplay error={error} />}
          </LinearGradient>
        }
        ListFooterComponent={
          <VStack className="my-6 px-6">
            <Text className="text-white font-bold">
              {`${t("app.shared.songCount", { count: playlistData?.playlist.songCount ?? 0 })} `}{" "}
              ⦁ {formatDuration(playlistData?.playlist.duration || 0)}
            </Text>
          </VStack>
        }
        contentContainerStyle={{
          paddingBottom: screenBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
      />
      <CenteredBottomSheetModal
        ref={bottomSheetShareModalRef}
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
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
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
              <ImageWithFallback
                source={
                  playlistData?.playlist?.coverArt
                    ? { uri: artworkUrl(playlistData?.playlist?.coverArt) }
                    : undefined
                }
                className="w-16 h-16 rounded-md aspect-square"
                alt="Playlist cover"
                fallback={
                  <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                    <ListMusic size={24} color={white} />
                  </Box>
                }
              />
              <VStack className="ml-4 flex-1">
                <Heading
                  className="text-white font-normal"
                  size="lg"
                  numberOfLines={1}
                >
                  {playlistData?.playlist.name}
                </Heading>
              </VStack>
            </HStack>
            <VStack className="mt-6 gap-y-8">
              {!isSmartPlaylist && (
                <FadeOutScaleDown onPress={handlePlaylistReorderPress}>
                  <HStack className="items-center">
                    <ListOrdered size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.playlists.reorder")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
              {isSmartPlaylist && (
                <FadeOutScaleDown
                  onPress={handleEditRulesPress}
                  disabled={!isOnline}
                >
                  <HStack className="items-center">
                    <Wand2 size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.playlists.editRules")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
              <FadeOutScaleDown onPress={handlePlayNextPress}>
                <HStack className="items-center">
                  <ListStart size={24} color={gray200} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.playlists.playNext")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={handleAddToQueuePress}>
                <HStack className="items-center">
                  <ListPlus size={24} color={gray200} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.playlists.addToQueue")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              {playlistDownload.status === "downloading" ? (
                <HStack className="items-center">
                  <Download size={24} color={gray400} />
                  <Text className="ml-4 text-lg text-gray-400">
                    {t("app.shared.offline.savingForOffline")} (
                    {playlistDownload.downloadedCount}/{playlistDownload.total})
                  </Text>
                </HStack>
              ) : playlistDownload.status === "all" ? (
                <FadeOutScaleDown onPress={handleRemoveOfflinePress}>
                  <HStack className="items-center">
                    <X size={24} color={red500} />
                    <Text className="ml-4 text-lg text-red-400">
                      {t("app.shared.offline.removeOfflineDownloads")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              ) : (
                <FadeOutScaleDown
                  onPress={handleSaveOfflinePress}
                  disabled={!isOnline}
                >
                  <HStack className="items-center">
                    <Box className="size-6 rounded-full bg-emerald-500 items-center justify-center">
                      <ArrowDown size={20} color={black} />
                    </Box>
                    <Text className="ml-4 text-lg text-emerald-400">
                      {t("app.shared.offline.saveForOfflineListening")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
              <FadeOutScaleDown onPress={handlePlaylistUpdatePress}>
                <HStack className="items-center">
                  <Pencil size={24} color={gray200} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.playlists.edit")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              {capabilities.sharing && (
                <FadeOutScaleDown
                  onPress={handleSharePress}
                  disabled={!isOnline}
                >
                  <HStack className="items-center">
                    <Share2 size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.playlists.share")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
              <FadeOutScaleDown
                onPress={() => {
                  bottomSheetModalRef.current?.dismiss();
                  setShowAlertDialog(true);
                }}
              >
                <HStack className="items-center">
                  <X size={24} color={red500} />
                  <Text className="ml-4 text-lg text-red-400">
                    {t("app.playlists.delete")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
      <CenteredBottomSheetModal
        ref={bottomSheetSortModalRef}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
      >
        <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
          <Box className="p-6 w-full mb-12">
            <VStack className="mt-6 gap-y-8">
              <FadeOutScaleDown
                onPress={() =>
                  handleSortPress(
                    sort === "addedAtAsc" ? "addedAtDesc" : "addedAtAsc",
                  )
                }
              >
                <HStack className="items-center justify-between">
                  <VStack className="ml-4">
                    <Text className="text-lg text-gray-200">
                      {t("app.library.recentSort")}
                    </Text>
                  </VStack>
                  {sort === "addedAtAsc" && (
                    <ArrowUp size={24} color={emerald500} />
                  )}
                  {sort === "addedAtDesc" && (
                    <ArrowDown size={24} color={emerald500} />
                  )}
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() =>
                  handleSortPress(
                    sort === "alphabeticalAsc"
                      ? "alphabeticalDesc"
                      : "alphabeticalAsc",
                  )
                }
              >
                <HStack className="items-center justify-between">
                  <VStack className="ml-4">
                    <Text className="text-lg text-gray-200">
                      {t("app.library.alphabeticalSort")}
                    </Text>
                  </VStack>
                  {sort === "alphabeticalAsc" && (
                    <ArrowUp size={24} color={emerald500} />
                  )}
                  {sort === "alphabeticalDesc" && (
                    <ArrowDown size={24} color={emerald500} />
                  )}
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
      <AlertDialog
        isOpen={showAlertDialog}
        onClose={handleCloseAlertDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.playlists.deletePlaylistConfirmTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t("app.playlists.deletePlaylistConfirmDescription")}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCloseAlertDialog}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handlePlaylistDeletePress}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.delete")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}
