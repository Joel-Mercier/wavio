import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import PodcastEpisodeRow from "@/components/podcasts/PodcastEpisodeRow";
import { channelImageUrl } from "@/components/podcasts/ServerPodcastChannelListItem";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import type {
  PodcastChannel,
  PodcastEpisode,
} from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import { podcastEpisodeToTrack } from "@/utils/podcastEpisodeToTrack";

interface ServerPodcastEpisodeListItemProps {
  episode: PodcastEpisode;
  channel: PodcastChannel;
}

// The self-hosted counterpart of PodcastListItem: one episode of a favorited
// server channel, as listed by the Recent episodes feed alongside Taddy ones.
// Self-contained like PodcastListItem — it subscribes to playback itself, so a
// track change re-renders the visible rows rather than the whole screen.
export default function ServerPodcastEpisodeListItem({
  episode,
  channel,
}: ServerPodcastEpisodeListItemProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const isCurrent = playingTrack?.id === episode.id;
  const image = channelImageUrl(channel);
  // Same fallback the store uses when favoriting a channel: a feed the backend
  // hasn't parsed a title out of yet is still identifiable by its url.
  const seriesName = channel.title || channel.url;

  // One episode rather than the channel's whole list: the feed is a mix of both
  // podcast id-spaces, and the Taddy rows next to it queue a single episode too.
  const handlePlayPress = () => {
    if (isCurrent) {
      togglePlayPause();
      return;
    }
    const track = podcastEpisodeToTrack(episode, seriesName, channel);
    // Offline and not downloaded, playTracks leaves the queue alone rather than
    // stranding the player — say so instead of doing nothing.
    if (!playTracks([track])) {
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

  return (
    <PodcastEpisodeRow
      episode={episode}
      seriesName={seriesName}
      channelCoverArt={channel.coverArt}
      channelImageUrl={image}
      isCurrent={isCurrent}
      isPlaying={isCurrent && isPlaying}
      onPlayPress={handlePlayPress}
      onPress={() =>
        router.navigate({
          pathname: "/podcast-episodes/[id]",
          params: {
            id: episode.id,
            channelId: channel.id,
            title: episode.title,
            imageUrl: image,
          },
        })
      }
    />
  );
}
