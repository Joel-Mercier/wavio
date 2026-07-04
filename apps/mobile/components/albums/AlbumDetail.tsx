import {
	BottomSheetBackdrop,
	type BottomSheetModal,
	BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { parse } from "date-fns/parse";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import ArrowDown from "lucide-react-native/dist/esm/icons/arrow-down.mjs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import PlusCircle from "lucide-react-native/dist/esm/icons/circle-plus.mjs";
import ClipboardIcon from "lucide-react-native/dist/esm/icons/clipboard.mjs";
import ClipboardCheck from "lucide-react-native/dist/esm/icons/clipboard-check.mjs";
import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import Download from "lucide-react-native/dist/esm/icons/download.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Heart from "lucide-react-native/dist/esm/icons/heart.mjs";
import ListPlus from "lucide-react-native/dist/esm/icons/list-plus.mjs";
import ListStart from "lucide-react-native/dist/esm/icons/list-start.mjs";
import Share2 from "lucide-react-native/dist/esm/icons/share-2.mjs";
import Star from "lucide-react-native/dist/esm/icons/star.mjs";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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
import AlbumListItemSkeleton from "@/components/albums/AlbumListItemSkeleton";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import DownloadedBadge from "@/components/DownloadedBadge";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import PlayPauseButton from "@/components/PlayPauseButton";
import ShuffleToggle from "@/components/ShuffleToggle";
import StarRating from "@/components/StarRating";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Icon } from "@/components/ui/icon";
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
import {
	type DownloadCollectionMeta,
	useCollectionDownload,
	useIsDetailCached,
	useOfflineAlbum,
} from "@/hooks/offline";
import { useIsPlaying } from "@/hooks/player";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { useCapabilities } from "@/hooks/useCapabilities";
import useImageColors from "@/hooks/useImageColors";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import { playTracks, togglePlayPause } from "@/services/player";
import useActivity from "@/stores/activity";
import useApp from "@/stores/app";
import useQueue, { type QueueSource } from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import type { AlbumListRow } from "@/utils/albumDiscRows";
import { buildAlbumListRows } from "@/utils/albumDiscRows";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";
import { format, formatDuration } from "@/utils/date";
import { loadingData } from "@/utils/loadingData";
import { logError } from "@/utils/log";
import { goBackOrHome } from "@/utils/navigation";

const AnimatedFlashList = Animated.createAnimatedComponent(
	FlashList,
) as unknown as typeof FlashList;
const AnimatedBox = Animated.createAnimatedComponent(Box);

export default function AlbumDetail() {
	const [white, emerald500, gray200, black, gray400, red500] =
		Uniwind.getCSSVariable([
			"--color-white",
			"--color-emerald-500",
			"--color-gray-200",
			"--color-black",
			"--color-gray-400",
			"--color-red-500",
		]) as string[];
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const [showRatingModal, setShowRatingModal] = useState<boolean>(false);
	const [clipboardText, setClipboardText] = useState("");
	const [clipoardCopyDone, setClipoardCopyDone] = useState(false);
	const isWideLayout = useApp((s) => s.isWideLayout);
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
	const isOnline = useIsOnline();
	const toast = useToast();
	const { data: serverData, isLoading, error } = useAlbum(id);
	const offlineAlbumData = useOfflineAlbum(id);
	// Offline (or before the server query resolves) fall back to the downloaded
	// collection so a saved album stays browsable after a logout clears the React
	// Query cache.
	const data = serverData ?? offlineAlbumData;
	const artistReachable = useIsDetailCached(
		data?.album?.artistId ? ["artist", data.album.artistId] : null,
	);
	const {
		data: discoverMoreData,
		isLoading: discoverMoreIsLoading,
		error: discoverMoreError,
	} = useArtist(data?.album?.artistId ?? "");
	const colors = useImageColors(artworkUrl(data?.album?.coverArt));
	const topColor =
		(colors?.platform === "ios" ? colors.primary : colors?.muted) || black;
	const addRecentPlay = useRecentPlays((store) => store.addRecentPlay);
	const recordActivity = useActivity((store) => store.recordActivity);
	const insets = useSafeAreaInsets();
	const screenBottomPadding = useScreenBottomPadding();
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

	const handleGoToArtistPress = () => {
		bottomSheetModalRef.current?.dismiss();
		router.navigate(`/artists/${data?.album.artists?.[0].id}`);
	};

	const handleFavoritePress = () => {
		if (!data?.album?.id) return;
		const albumId = data.album.id;
		queryClient.setQueryData(["album", id], {
			...data,
			album: {
				...data?.album,
				starred: new Date().toISOString(),
			},
		});
		doFavorite.mutate(
			{ id: albumId, albumId },
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
		if (!data?.album?.id) return;
		const albumId = data.album.id;
		queryClient.setQueryData(["album", id], {
			...data,
			album: {
				...data?.album,
				starred: undefined,
			},
		});
		doUnfavorite.mutate(
			{ id: albumId, albumId },
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

	const handlePlayNextPress = () => {
		const songs = data?.album?.song;
		if (!songs || songs.length === 0) return;
		const tracks = songs.map(childToTrack);
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
			logError(e);
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
	const albumTracks = data?.album?.song;
	const albumSource = useMemo<QueueSource>(
		() =>
			data?.album
				? { type: "album", name: data.album.name, id: data.album.id }
				: null,
		[data?.album],
	);
	const handleTrackPress = useTrackListPress(albumTracks, albumSource);
	const { rows: discRows, isMultiDisc } = useMemo(
		() => buildAlbumListRows(albumTracks, data?.album?.discTitles),
		[albumTracks, data?.album?.discTitles],
	);
	const albumMeta = useMemo<DownloadCollectionMeta | undefined>(
		() =>
			data?.album
				? {
						id,
						kind: "album",
						name: data.album.name,
						coverArt: data.album.coverArt,
						artist: data.album.artist,
						artistId: data.album.artistId,
						year: data.album.year,
					}
				: undefined,
		[id, data?.album],
	);
	const albumDownload = useCollectionDownload(albumTracks, albumMeta);

	const handleSaveOfflinePress = async () => {
		bottomSheetModalRef.current?.dismiss();
		try {
			await albumDownload.saveAll();
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
			logError("Error saving album for offline:", error);
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
			await albumDownload.removeAll();
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
			logError("Error removing album offline downloads:", error);
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
	const queueSource = useQueue((store) => store.source);
	const isActiveSource = queueSource?.type === "album" && queueSource.id === id;
	const handlePlayPress = () => {
		if (isActiveSource) {
			togglePlayPause();
			return;
		}
		if (!albumTracks || albumTracks.length === 0) return;
		playTracks(albumTracks.map(childToTrack), 0, {
			shuffleFromRandom: true,
			source: albumSource,
		});
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

	const shuffle = useQueue((store) => store.shuffle);
	const setShuffle = useQueue((store) => store.setShuffle);
	const handleShufflePress = () => {
		setShuffle(!shuffle);
	};

	const album = data?.album;
	const handleTrackPressCallback = useCallback(() => {
		if (album) {
			addRecentPlay({
				id,
				title: album.name,
				type: "album",
				coverArt: album.coverArt,
			});
			recordActivity({
				id,
				title: album.name,
				type: "album",
				coverArt: album.coverArt,
				artist: album.artist,
			});
		}
	}, [album, id, addRecentPlay, recordActivity]);

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

	return (
		<Box className="h-full w-full">
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
					paddingBottom: screenBottomPadding,
				}}
				data={isLoading ? loadingData(16) : discRows}
				keyExtractor={(item: AlbumListRow, index: number) =>
					isLoading ? `skeleton-${index}` : item.key
				}
				getItemType={(item: AlbumListRow) => (isLoading ? "track" : item.kind)}
				renderItem={({
					item,
					index,
				}: {
					item: AlbumListRow;
					index: number;
				}) => {
					if (isLoading) {
						return (
							<TrackListItemSkeleton
								index={index}
								showCoverArt={false}
								className="px-6"
							/>
						);
					}
					if (item.kind === "disc") {
						return (
							<HStack className="items-center gap-x-2 px-6 mt-6 mb-2">
								<Disc3 size={16} color={gray400} />
								<Heading size="sm" className="text-gray-300">
									{item.title || t("app.albums.disc", { number: item.disc })}
								</Heading>
							</HStack>
						);
					}
					return (
						<TrackListItem
							track={item.track}
							index={item.trackIndex}
							onPress={handleTrackPress}
							className="px-6"
							onPlayCallback={handleTrackPressCallback}
							showCoverArt={false}
							disableFirstItemMargin={isMultiDisc}
						/>
					);
				}}
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
							<FadeOutScaleDown
								onPress={() => goBackOrHome(router)}
								className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
							>
								<ArrowLeft size={24} color={white} />
							</FadeOutScaleDown>
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
										data?.album?.coverArt
											? { uri: artworkUrl(data?.album?.coverArt) }
											: undefined
									}
									className="w-full h-full aspect-square rounded-md"
									alt="Album cover"
									fallback={
										<Box className="w-full h-full aspect-square rounded-md bg-primary-600 items-center justify-center">
											<Disc3 size={48} color={white} />
										</Box>
									}
								/>
							</AnimatedBox>
							<Box className="w-10" />
						</HStack>
						<VStack>
							<HStack className="mt-5 items-center">
								<Heading numberOfLines={2} className="text-white" size="2xl">
									{data?.album?.name}
								</Heading>
							</HStack>
							<HStack className="mt-4 items-center">
								<ImageWithFallback
									source={
										data?.album?.artistId
											? { uri: artworkUrl(data?.album?.artistId) }
											: undefined
									}
									className="w-8 h-8 rounded-full aspect-square"
									alt="Artist cover"
									fallback={
										<Box className="w-8 h-8 rounded-full bg-primary-600 items-center justify-center">
											<User size={16} color={white} />
										</Box>
									}
								/>
								<Text className="ml-4 text-white text-md font-bold flex-1">
									{((data?.album?.artists?.length || 0) > 1 &&
										data?.album?.artists?.map((artist) => (
											<React.Fragment key={artist.id}>
												{artistReachable ? (
													<Link href={`/artists/${artist.id}`}>
														{artist.name}
													</Link>
												) : (
													<Text>{artist.name}</Text>
												)}
												{artist.id ===
												data?.album?.artists?.[
													(data?.album?.artists?.length ?? 0) - 1
												]?.id ? null : (
													<Text>, </Text>
												)}
											</React.Fragment>
										))) ||
										(artistReachable ? (
											<Link href={`/artists/${data?.album?.artistId}`}>
												{data?.album?.displayArtist || data?.album?.artist}
											</Link>
										) : (
											<Text>
												{data?.album?.displayArtist || data?.album?.artist}
											</Text>
										))}
								</Text>
							</HStack>
							<HStack className="mt-2 items-center gap-x-2">
								{albumDownload.status === "all" && <DownloadedBadge />}
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
											? t("app.albums.typeCompilation")
											: t("app.albums.typeAlbum")}{" "}
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
									<AnimatedHeart
										filled={!!data?.album?.starred}
										disabled={!isOnline}
										onPress={
											data?.album?.starred
												? handleUnfavoritePress
												: handleFavoritePress
										}
									/>
									<FadeOutScaleDown
										testID="album-menu-button"
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
										testID="album-play-button"
									/>
								</HStack>
							</HStack>
						</VStack>
						{error && <ErrorDisplay error={error} />}
					</LinearGradient>
				}
				ListFooterComponent={
					<VStack className="my-6">
						<Text className="text-white font-bold px-6">
							{`${t("app.shared.songCount", { count: data?.album?.songCount ?? 0 })} `}{" "}
							⦁ {formatDuration(data?.album?.duration || 0)}
						</Text>
						{data?.album?.recordLabels?.map((recordLabel) => (
							<Text
								className="text-primary-100 text-sm px-6"
								key={recordLabel.name}
							>
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
									<HStack className="mt-6 mb-4 items-center justify-between gap-x-4 px-6">
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
											contentContainerClassName="pl-6 mb-6"
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
				}
				ListEmptyComponent={<EmptyDisplay />}
				// contentContainerStyle={{ paddingHorizontal: 24 }}
				showsVerticalScrollIndicator={false}
			/>
			<CenteredBottomSheetModal
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
				onChange={handleSheetPositionChange}
				backgroundStyle={{
					backgroundColor: "rgb(41, 41, 41)",
				}}
				handleIndicatorStyle={{
					backgroundColor: "#b3b3b3",
				}}
				backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
			>
				<BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
					<Box className="p-6 w-full mb-12">
						<HStack className="items-center">
							<ImageWithFallback
								source={
									data?.album?.coverArt
										? { uri: artworkUrl(data?.album?.coverArt) }
										: undefined
								}
								className="w-16 h-16 rounded-md aspect-square"
								alt="Album cover"
								fallback={
									<Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
										<Disc3 size={24} color={white} />
									</Box>
								}
							/>
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
							<FadeOutScaleDown
								onPress={handleAddAllToFavoritesPress}
								disabled={!isOnline}
							>
								<HStack className="items-center">
									<Heart size={24} color={gray200} />
									<Text className="ml-4 text-lg text-gray-200">
										{t("app.albums.addAllToFavorites")}
									</Text>
								</HStack>
							</FadeOutScaleDown>
							<FadeOutScaleDown
								onPress={handleAddToPlaylistPress}
								disabled={!isOnline}
							>
								<HStack className="items-center">
									<PlusCircle size={24} color={gray200} />
									<Text className="ml-4 text-lg text-gray-200">
										{t("app.albums.addToPlaylist")}
									</Text>
								</HStack>
							</FadeOutScaleDown>
							{albumDownload.status === "downloading" ? (
								<HStack className="items-center">
									<Download size={24} color={gray400} />
									<Text className="ml-4 text-lg text-gray-400">
										{t("app.shared.offline.savingForOffline")} (
										{albumDownload.downloadedCount}/{albumDownload.total})
									</Text>
								</HStack>
							) : albumDownload.status === "all" ? (
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
							<FadeOutScaleDown
								onPress={handleGoToArtistPress}
								disabled={!artistReachable}
							>
								<HStack className="items-center">
									<User size={24} color={gray200} />
									<Text className="ml-4 text-lg text-gray-200">
										{t("app.albums.goToArtist")}
									</Text>
								</HStack>
							</FadeOutScaleDown>
							<FadeOutScaleDown onPress={handlePlayNextPress}>
								<HStack className="items-center">
									<ListStart size={24} color={gray200} />
									<Text className="ml-4 text-lg text-gray-200">
										{t("app.albums.playNext")}
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
								<FadeOutScaleDown
									onPress={handleRatingPress}
									disabled={!isOnline}
								>
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
								<FadeOutScaleDown
									onPress={handleSharePress}
									disabled={!isOnline}
								>
									<HStack className="items-center">
										<Share2 size={24} color={gray200} />
										<Text className="ml-4 text-lg text-gray-200">
											{t("app.albums.share")}
										</Text>
									</HStack>
								</FadeOutScaleDown>
							)}
							{data?.album?.musicBrainzId && (
								<FadeOutScaleDown
									onPress={handleMusicBrainzPress}
									disabled={!isOnline}
								>
									<HStack className="items-center">
										<MusicBrainz width={24} height={24} fill={gray200} />
										<Text className="ml-4 text-lg text-gray-200">
											{t("app.albums.musicBrainz")}
										</Text>
									</HStack>
								</FadeOutScaleDown>
							)}
							{data?.album?.name && data?.album?.artist && (
								<FadeOutScaleDown
									onPress={handleLastFMPress}
									disabled={!isOnline}
								>
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
				</BottomSheetScrollView>
			</CenteredBottomSheetModal>
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
