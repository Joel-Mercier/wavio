import { secondsToMinutes } from "date-fns/secondsToMinutes";
import Podcast from "lucide-react-native/dist/esm/icons/mic-signal.mjs";
import Trash from "lucide-react-native/dist/esm/icons/trash.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import PlayPauseButton from "@/components/PlayPauseButton";
import EpisodeDownloadButton from "@/components/podcasts/EpisodeDownloadButton";
import {
  EpisodeProgressBar,
  MarkAsPlayedButton,
} from "@/components/podcasts/EpisodeProgress";
import RichText from "@/components/RichText";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useIsTrackAvailableOffline } from "@/hooks/offline";
import { useIsOnline } from "@/hooks/useIsOnline";
import type { PodcastEpisode } from "@/services/openSubsonic/types";
import { artworkUrl } from "@/utils/artwork";
import { formatDistanceToNow } from "@/utils/date";
import { isPlayablePodcastEpisode } from "@/utils/podcastEpisodeToTrack";

interface PodcastEpisodeRowProps {
  episode: PodcastEpisode;
  seriesName: string;
  channelCoverArt?: string;
  // The channel image the screen header already resolved and loaded. Used as
  // the last artwork fallback, so a channel known only by a direct feed image
  // (no Subsonic cover id) still gives its episodes a thumbnail.
  channelImageUrl?: string;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlayPress: () => void;
  // Optional so the row can drop an affordance that doesn't belong where it's
  // rendered: deleting server-side media is a channel-screen action.
  onDeletePress?: () => void;
  onPress?: () => void;
}

// One episode of a server-hosted or self-hosted (RSS) channel, as listed by
// ServerPodcastChannelScreen and the Recent episodes feed. Unlike
// ServerPodcastChannelListItem — which is a link to a channel and nothing else —
// every control on this row acts on the episode.
export default function PodcastEpisodeRow({
  episode,
  seriesName,
  channelCoverArt,
  channelImageUrl,
  isCurrent,
  isPlaying,
  onPlayPress,
  onDeletePress,
  onPress,
}: PodcastEpisodeRowProps) {
  const [white, black] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-black",
  ]) as string[];
  const { t } = useTranslation();
  const playable = isPlayablePodcastEpisode(episode);

  // Same resolution the player uses (episodeArtwork in podcastEpisodeToTrack).
  // Feeds rarely give an episode its own image, and the on-device RSS store
  // pre-fills each episode's cover with the feed's (services/local/podcasts.ts),
  // so in the common case every row here resolves to the exact URL the screen
  // header already loaded — one expo-image cache entry, no extra request.
  const artworkId = episode.coverArt || channelCoverArt;
  const image = artworkId ? artworkUrl(artworkId) : channelImageUrl;

  const isDownloaded = useIsTrackAvailableOffline(episode.id);
  const isOnline = useIsOnline();

  // Joined rather than interpolated so a feed that declares no date or no
  // duration can't leave a stray separator behind. An episode the server hasn't
  // finished fetching carries its status here, where the play button it replaces
  // would otherwise be explained by nothing.
  const meta = [
    episode.publishDate
      ? t("app.podcasts.publishedAt", {
          distance: formatDistanceToNow(new Date(episode.publishDate)),
        })
      : null,
    episode.duration ? `${secondsToMinutes(episode.duration)} min` : null,
    playable ? null : t(`app.podcasts.episodeStatus.${episode.status}`),
  ]
    .filter(Boolean)
    .join(" ⦁ ");

  const row = (
    <VStack className="px-6 my-3 gap-y-2 border-b border-b-primary-400">
      <HStack className="gap-x-4">
        <ImageWithFallback
          source={{ uri: image }}
          className="w-16 h-16 rounded-md aspect-square"
          alt={episode.title}
          fallback={
            <Box className="w-16 h-16 aspect-square rounded-md bg-primary-600 items-center justify-center">
              <Podcast size={24} color={white} />
            </Box>
          }
        />
        <VStack className="flex-1">
          <Heading className="text-white text-lg" numberOfLines={2}>
            {episode.title}
          </Heading>
          <Text className="text-primary-100" numberOfLines={1}>
            {seriesName}
          </Text>
        </VStack>
      </HStack>
      {!!episode.description && (
        <RichText className="text-primary-100" numberOfLines={2}>
          {episode.description}
        </RichText>
      )}
      {!!meta && <Text className="flex-1 text-white">{meta}</Text>}
      <HStack className="items-center justify-between mb-4">
        <HStack className="items-center gap-x-4">
          <MarkAsPlayedButton id={episode.id} size={22} />
          <EpisodeDownloadButton
            episode={episode}
            seriesName={seriesName}
            channelCoverArt={channelCoverArt}
          />
          {!!onDeletePress && (
            <FadeOutScaleDown onPress={onDeletePress}>
              <Trash size={22} color={white} />
            </FadeOutScaleDown>
          )}
        </HStack>
        <HStack className="items-center gap-x-3">
          <EpisodeProgressBar id={episode.id} />
          {playable && (
            <PlayPauseButton
              isPlaying={isPlaying}
              onPress={onPlayPress}
              disabled={!isCurrent && !isOnline && !isDownloaded}
              size={40}
              iconSize={20}
              color={black}
              className="bg-white"
            />
          )}
        </HStack>
      </HStack>
    </VStack>
  );

  // The controls inside are Pressables of their own, so a tap on one of them
  // becomes the responder: the row neither animates nor navigates behind it.
  if (!onPress) return row;

  return <FadeOutScaleDown onPress={onPress}>{row}</FadeOutScaleDown>;
}
