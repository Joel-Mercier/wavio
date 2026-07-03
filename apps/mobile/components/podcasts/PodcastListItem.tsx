import { fromUnixTime } from "date-fns/fromUnixTime";
import { secondsToMinutes } from "date-fns/secondsToMinutes";
import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Podcast from "lucide-react-native/dist/esm/icons/podcast.mjs";
import Share2 from "lucide-react-native/dist/esm/icons/share-2.mjs";
import { useTranslation } from "react-i18next";
import Share from "react-native-share";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import PlayPauseButton from "@/components/PlayPauseButton";
import { usePodcastEpisodeActions } from "@/components/podcasts/PodcastEpisodeActionsProvider";
import RichText from "@/components/RichText";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import { playTracks, togglePlayPause } from "@/services/player";
import type { PodcastEpisode } from "@/services/taddyPodcasts/types";
import { formatDistanceToNow } from "@/utils/date";
import { formatRichTextPlain } from "@/utils/formatRichText";
import { logError } from "@/utils/log";
import { cn } from "@/utils/tailwind";

interface PodcastListItemProps {
  podcast: PodcastEpisode;
  index: number;
  seriesName?: string;
  isFavorite?: boolean;
  episodes?: PodcastEpisode[];
}

function episodeToTrack(episode: PodcastEpisode, fallbackSeriesName?: string) {
  return {
    id: episode.uuid,
    url: episode.audioUrl,
    title: episode.name,
    artist: fallbackSeriesName || episode?.podcastSeries?.name,
    artwork: episode.imageUrl,
    duration: episode.duration,
    source: "podcast" as const,
    description: episode.description,
    websiteUrl: episode.websiteUrl,
    datePublished: episode.datePublished,
    podcastSeries: episode.podcastSeries,
  };
}

export default function PodcastListItem({
  podcast,
  index,
  seriesName,
  episodes,
}: PodcastListItemProps) {
  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const isCurrent = playingTrack?.id === podcast.uuid;
  const [white, black] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-black",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { open: openPodcastActions } = usePodcastEpisodeActions();

  const handlePresentModalPress = () => {
    openPodcastActions({
      uuid: podcast.uuid,
      name: podcast.name,
      imageUrl: podcast.imageUrl,
      podcastSeries: podcast.podcastSeries,
      seriesName,
    });
  };

  const handlePlayPress = () => {
    if (isCurrent) {
      togglePlayPause();
      return;
    }
    if (!podcast.audioUrl) return;
    if (episodes && episodes.length > 0) {
      const startIndex = episodes.findIndex((e) => e.uuid === podcast.uuid);
      const tracks = episodes
        .filter((e) => !!e.audioUrl)
        .map((e) => episodeToTrack(e, seriesName));
      const start = Math.max(
        0,
        tracks.findIndex((t) => t.id === podcast.uuid),
      );
      if (tracks.length > 0) {
        playTracks(tracks, start >= 0 ? start : Math.max(0, startIndex));
        return;
      }
    }
    playTracks([episodeToTrack(podcast, seriesName)]);
  };

  const handleSharePress = async () => {
    try {
      const plain = formatRichTextPlain(podcast.description);
      const excerpt =
        plain.length > 240 ? `${plain.slice(0, 240).trimEnd()}…` : plain;
      const message = [podcast.name, excerpt].filter(Boolean).join("\n\n");

      const linkUrl =
        podcast.websiteUrl || podcast.podcastSeries?.websiteUrl || undefined;

      if (linkUrl) {
        await Share.open({
          title: podcast.name,
          message,
          url: linkUrl,
          failOnCancel: false,
        });
        return;
      }

      let localImageUri: string | undefined;
      if (podcast.imageUrl) {
        try {
          const ext = podcast.imageUrl.split("?")[0].split(".").pop();
          const safeExt = ext && ext.length <= 5 ? ext : "jpg";
          const fileName = `podcast-share-${podcast.uuid}.${safeExt}`;
          const dest = new File(Paths.cache, fileName);
          if (dest.exists) dest.delete();
          const downloaded = await File.downloadFileAsync(
            podcast.imageUrl,
            dest,
          );
          localImageUri = downloaded.uri;
        } catch (e) {
          console.warn("Failed to download podcast cover for sharing", e);
        }
      }

      await Share.open({
        title: podcast.name,
        message,
        ...(localImageUri ? { url: localImageUri, type: "image/jpeg" } : {}),
        failOnCancel: false,
      });
    } catch (error) {
      logError(error);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.podcasts.shareErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  return (
    <Pressable
      onPress={() =>
        router.navigate({
          pathname: "/podcasts/[id]",
          params: {
            id: podcast.uuid,
            uuid: podcast.uuid,
            name: podcast.name,
            description: podcast.description,
            imageUrl: podcast.imageUrl,
            datePublished: podcast.datePublished,
            duration: podcast.duration,
            audioUrl: podcast.audioUrl,
            websiteUrl: podcast.websiteUrl,
            podcastSeries: JSON.stringify(podcast.podcastSeries),
          },
        })
      }
      className="px-6"
    >
      <VStack
        className={cn("my-3 gap-y-2 border-b border-b-primary-400", {
          "mt-6": index === 0,
        })}
      >
        <HStack className="gap-x-4">
          <ImageWithFallback
            source={{ uri: podcast.imageUrl }}
            className="w-16 h-16 rounded-md aspect-square"
            alt={podcast.name}
            fallback={
              <Box className="w-16 h-16 aspect-square rounded-md bg-primary-600 items-center justify-center">
                <Podcast size={24} color={white} />
              </Box>
            }
          />
          <VStack className="flex-1">
            <Heading className="text-white text-lg" numberOfLines={2}>
              {podcast.name}
            </Heading>
            <Text className="text-primary-100" numberOfLines={1}>
              {seriesName || podcast?.podcastSeries?.name}
            </Text>
          </VStack>
        </HStack>
        <RichText className="flex-1 text-primary-100" numberOfLines={2}>
          {podcast.description}
        </RichText>
        <Text className="flex-1 text-white">
          {podcast.datePublished &&
            t("app.podcasts.publishedAt", {
              distance: formatDistanceToNow(
                fromUnixTime(podcast.datePublished),
              ),
            })}
          {" ⦁ "}
          {`${secondsToMinutes(podcast.duration)} min`}
        </Text>
        <HStack className="items-center justify-between mb-4">
          <HStack className="items-center gap-x-4">
            <FadeOutScaleDown onPress={handleSharePress}>
              <Share2 size={24} color={white} />
            </FadeOutScaleDown>
            <FadeOutScaleDown onPress={handlePresentModalPress}>
              <EllipsisVertical size={24} color={white} />
            </FadeOutScaleDown>
          </HStack>
          <PlayPauseButton
            isPlaying={isCurrent && isPlaying}
            onPress={handlePlayPress}
            size={40}
            iconSize={20}
            color={black}
            className="bg-white"
          />
        </HStack>
      </VStack>
    </Pressable>
  );
}
