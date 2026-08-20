import { secondsToMinutes } from "date-fns/secondsToMinutes";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import Podcast from "lucide-react-native/dist/esm/icons/mic-signal.mjs";
import { useMemo } from "react";
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
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import PlayPauseButton from "@/components/PlayPauseButton";
import EpisodeDownloadButton from "@/components/podcasts/EpisodeDownloadButton";
import {
  EpisodeProgressBar,
  MarkAsPlayedButton,
} from "@/components/podcasts/EpisodeProgress";
import { channelImageUrl } from "@/components/podcasts/ServerPodcastChannelListItem";
import RichText from "@/components/RichText";
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
import { useGetPodcasts } from "@/hooks/backend/usePodcasts";
import { useIsTrackAvailableOffline } from "@/hooks/offline";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import useImageColors from "@/hooks/useImageColors";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { PodcastChannel } from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import useApp from "@/stores/app";
import { artworkUrl } from "@/utils/artwork";
import { formatDistanceToNow } from "@/utils/date";
import { goBackOrHome } from "@/utils/navigation";
import {
  isPlayablePodcastEpisode,
  podcastEpisodeToTrack,
} from "@/utils/podcastEpisodeToTrack";

const AnimatedBox = Animated.createAnimatedComponent(Box);
const AnimatedImage = Animated.createAnimatedComponent(ImageWithFallback);

// The self-hosted counterpart of the Taddy episode screen (podcasts/[id]), so an
// RSS episode row has somewhere to go. It fetches nothing of its own: the
// episode comes out of the channel query the list already filled — for every
// backend but OpenSubsonic that *is* the parsed RSS feed (services/backend/
// podcasts.ts) — so opening an episode is a cache read, and the route carries
// only ids plus enough to paint the header before the cache resolves.
export default function ServerPodcastEpisodeScreen() {
  const [white, black] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-black",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const screenBottomPadding = useScreenBottomPadding();
  const params = useLocalSearchParams<{
    id: string;
    channelId: string;
    title?: string;
    imageUrl?: string;
  }>();
  const { id, channelId } = params;

  const { data } = useGetPodcasts({ id: channelId });
  const channel: PodcastChannel | undefined =
    data?.podcasts?.channel?.find((c) => c.id === channelId) ??
    data?.podcasts?.channel?.[0];
  const episodes = useMemo(() => channel?.episode ?? [], [channel]);
  const episode = episodes.find((e) => e.id === id);

  const title = episode?.title || params.title || "";
  const seriesName = channel?.title || channel?.url || "";
  // Same resolution as the row the user tapped, with the route's copy standing
  // in until the channel query resolves (or while it's paused offline).
  const artworkId = episode?.coverArt || channel?.coverArt;
  const image =
    (artworkId ? artworkUrl(artworkId) : undefined) ??
    (channel ? channelImageUrl(channel) : undefined) ??
    params.imageUrl;
  const seriesImage = channel ? channelImageUrl(channel) : params.imageUrl;
  const colors = useImageColors(image);
  const topColor =
    (colors?.platform === "ios"
      ? colors.primary
      : colors?.muted === black
        ? colors?.darkVibrant
        : colors?.muted) || black;

  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const isCurrent = playingTrack?.id === id;
  const isOnline = useIsOnline();
  const isDownloaded = useIsTrackAvailableOffline(id);
  const playable = !!episode && isPlayablePodcastEpisode(episode);

  const offsetY = useSharedValue(0);
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offsetY.value, [0, 220], [0, 1], Extrapolation.CLAMP),
  }));
  const artworkStyle = useAnimatedStyle(() => ({
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
  }));
  const scrollHandler = useAnimatedScrollHandler((event) => {
    offsetY.value = event.contentOffset.y;
  });

  const goToChannel = () => {
    router.navigate({
      pathname: "/podcast-channels/[id]",
      params: {
        id: channelId,
        title: channel?.title,
        imageUrl: seriesImage,
        coverArt: channel?.coverArt,
        url: channel?.url,
        description: channel?.description,
      },
    });
  };

  // Queues the channel from here, like the channel screen does, so an episode
  // rolls on into the next one instead of stopping the player dead.
  const handlePlayPress = () => {
    if (isCurrent) {
      togglePlayPause();
      return;
    }
    if (!episode) return;
    const tracks = episodes
      .filter(isPlayablePodcastEpisode)
      .map((e) => podcastEpisodeToTrack(e, seriesName, channel));
    const start = Math.max(
      0,
      tracks.findIndex((track) => track.id === episode.id),
    );
    if (tracks.length === 0) return;
    if (!playTracks(tracks, start)) {
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.shared.notAvailableOfflineMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  // Joined rather than interpolated so a feed that declares no date or no
  // duration can't leave a stray separator behind — same rule as the row.
  const meta = [
    episode?.publishDate
      ? t("app.podcasts.publishedAt", {
          distance: formatDistanceToNow(new Date(episode.publishDate)),
        })
      : null,
    episode?.duration ? `${secondsToMinutes(episode.duration)} min` : null,
    !episode || playable
      ? null
      : t(`app.podcasts.episodeStatus.${episode.status}`),
  ]
    .filter(Boolean)
    .join(" ⦁ ");

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
              className="text-white text-center font-bold truncate flex-1 ml-4"
              size="lg"
            >
              {title}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </AnimatedBox>
      <Animated.ScrollView
        contentContainerStyle={{
          paddingBottom: screenBottomPadding + (isWideLayout ? 48 : 0),
        }}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
      >
        {/* The artwork's dominant colour bleeding into black behind the header
            block, as on the album and channel screens — the sticky app bar
            above reuses the same colour so the two meet seamlessly on scroll. */}
        <LinearGradient
          colors={[topColor, black]}
          locations={[0, 0.8]}
          style={{
            paddingTop: insets.top,
            paddingHorizontal: 24,
            paddingBottom: 16,
          }}
        >
          <HStack className="mt-6 items-start justify-between">
            <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
              <ArrowLeft size={24} color={white} />
            </FadeOutScaleDown>
            <AnimatedImage
              style={artworkStyle}
              source={image ? { uri: image } : undefined}
              className={`${
                isWideLayout ? "w-[45%]" : "w-[70%]"
              } aspect-square rounded-md`}
              alt={title}
              contentFit="cover"
              fallback={
                <Box
                  className={`${
                    isWideLayout ? "w-[45%]" : "w-[70%]"
                  } aspect-square rounded-md bg-primary-600 items-center justify-center`}
                >
                  <Podcast size={48} color={white} />
                </Box>
              }
            />
            <Box className="w-6" />
          </HStack>
          <VStack className="mt-5 flex-1">
            <Heading className="text-white" size="xl">
              {title}
            </Heading>
            <FadeOutScaleDown onPress={goToChannel}>
              <HStack className="mt-4 items-center">
                <ImageWithFallback
                  source={seriesImage ? { uri: seriesImage } : undefined}
                  className="w-8 h-8 rounded-full aspect-square"
                  alt={seriesName}
                  contentFit="cover"
                  fallback={
                    <Box className="w-8 h-8 rounded-full bg-primary-600 items-center justify-center">
                      <Podcast size={16} color={white} />
                    </Box>
                  }
                />
                <Text
                  className="ml-4 text-white text-md font-bold"
                  numberOfLines={1}
                >
                  {seriesName}
                </Text>
              </HStack>
            </FadeOutScaleDown>
            {!!meta && (
              <Text className="flex-1 text-primary-100 mt-2">{meta}</Text>
            )}
          </VStack>
          <HStack className="mt-4 items-center justify-between">
            <HStack className="items-center gap-x-4">
              <MarkAsPlayedButton id={id} />
              {!!episode && (
                <EpisodeDownloadButton
                  episode={episode}
                  seriesName={seriesName}
                  channelCoverArt={channel?.coverArt}
                  size={24}
                />
              )}
            </HStack>
            <HStack className="items-center gap-x-4">
              <EpisodeProgressBar id={id} />
              {playable && (
                <PlayPauseButton
                  isPlaying={isCurrent && isPlaying}
                  onPress={handlePlayPress}
                  disabled={!isCurrent && !isOnline && !isDownloaded}
                  size={48}
                  iconSize={24}
                  color={white}
                  className="bg-emerald-500"
                />
              )}
            </HStack>
          </HStack>
        </LinearGradient>
        {!!episode?.description && (
          <RichText className="text-md text-white mt-4 px-6">
            {episode.description}
          </RichText>
        )}
      </Animated.ScrollView>
    </Box>
  );
}
