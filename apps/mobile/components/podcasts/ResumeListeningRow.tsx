import { useRouter } from "expo-router";
import Podcast from "lucide-react-native/dist/esm/icons/mic-signal.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import { EpisodeProgressBar } from "@/components/podcasts/EpisodeProgress";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { usePlayingTrack } from "@/hooks/player";
import { playTracks, togglePlayPause } from "@/services/player";
import { useCurrentAuthScope } from "@/stores/auth";
import usePodcasts, {
  type PodcastProgressEntry,
  podcastProgressForScope,
} from "@/stores/podcasts";
import { artworkUrl } from "@/utils/artwork";
import { podcastProgressEntryToTrack } from "@/utils/podcastEpisodeToTrack";

const MAX_ITEMS = 10;

// Episodes left unfinished, most recent first. Reads a persisted store, so it
// has no loading or error state — and it subscribes here rather than in the
// screen so a listening episode's throttled write doesn't re-render the whole
// podcasts index.
export default function ResumeListeningRow() {
  const { t } = useTranslation();
  const scope = useCurrentAuthScope();
  const progress = usePodcasts((state) => state.podcastProgress);
  const entries = podcastProgressForScope(progress, scope).slice(0, MAX_ITEMS);

  if (entries.length === 0) return null;

  return (
    <>
      <Box className="px-6 mt-4 mb-4">
        <Heading size="xl" className="text-white">
          {t("app.podcasts.resumeListening")}
        </Heading>
      </Box>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="mb-6 pl-6"
      >
        {entries.map((entry) => (
          <ResumeListeningCard key={entry.id} entry={entry} />
        ))}
      </ScrollView>
    </>
  );
}

function ResumeListeningCard({ entry }: { entry: PodcastProgressEntry }) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const playingTrack = usePlayingTrack();
  const image =
    entry.artwork || (entry.coverArt ? artworkUrl(entry.coverArt) : undefined);

  const handlePress = () => {
    if (playingTrack?.id === entry.id) {
      togglePlayPause();
      return;
    }
    // loadTrack reads the stored position itself, so there is no seek here.
    if (!playTracks([podcastProgressEntryToTrack(entry)])) {
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

  const handleLongPress = () => {
    if (entry.source === "server") {
      if (!entry.channelId) return;
      router.navigate({
        pathname: "/podcast-channels/[id]",
        params: {
          id: entry.channelId,
          title: entry.seriesName,
          imageUrl: image,
          coverArt: entry.coverArt,
        },
      });
      return;
    }
    if (!entry.seriesUuid) return;
    router.navigate({
      pathname: "/podcast-series/[id]",
      params: {
        id: entry.seriesUuid,
        uuid: entry.seriesUuid,
        name: entry.seriesName,
        imageUrl: image,
      },
    });
  };

  return (
    <FadeOutScaleDown onPress={handlePress} onLongPress={handleLongPress}>
      {/* Sized to match the other horizontal podcast cards on this screen
          (PodcastSeriesListItem / ServerPodcastChannelListItem). */}
      <VStack className="w-32 mr-6 gap-y-2">
        <ImageWithFallback
          source={{ uri: image }}
          className="w-32 h-32 rounded-md aspect-square"
          alt={entry.title}
          fallback={
            <Box className="w-32 h-32 aspect-square rounded-md bg-primary-600 items-center justify-center">
              <Podcast size={48} color={white} />
            </Box>
          }
        />
        <Heading size="sm" className="text-white" numberOfLines={2}>
          {entry.title}
        </Heading>
        <EpisodeProgressBar id={entry.id} barClassName="flex-1" />
        <Text className="text-primary-100" numberOfLines={1}>
          {entry.seriesName}
        </Text>
      </VStack>
    </FadeOutScaleDown>
  );
}
