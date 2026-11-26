import { useQueryClient } from "@tanstack/react-query";
import Cast from "lucide-react-native/icons/cast";
import RotateCcw from "lucide-react-native/icons/rotate-ccw";
import RotateCw from "lucide-react-native/icons/rotate-cw";
import SkipBack from "lucide-react-native/icons/skip-back";
import SkipForward from "lucide-react-native/icons/skip-forward";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import type { GestureResponderEvent } from "react-native";
import { Uniwind } from "uniwind";
import AnimatedHeart from "@/components/AnimatedHeart";
import { openOutputSheet } from "@/components/player/OutputSheet";
import RepeatToggle from "@/components/RepeatToggle";
import ShuffleToggle from "@/components/ShuffleToggle";
import { Box } from "@/components/ui/box";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { useStar, useUnstar } from "@/hooks/backend/useMediaAnnotation";
import { useCanCast } from "@/hooks/player/useCanCast";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useIsOnline } from "@/hooks/useIsOnline";
import {
  PODCAST_SEEK_BACKWARD_SECONDS,
  PODCAST_SEEK_FORWARD_SECONDS,
  seekBy,
  skipNext,
  skipPrevious,
} from "@/services/player";
import type { PodcastSeries } from "@/services/taddyPodcasts/types";
import type { FloatingPlayerAction } from "@/stores/app";
import useCast from "@/stores/cast";
import useJukebox from "@/stores/jukebox";
import usePodcasts from "@/stores/podcasts";
import useQueue, { nextRepeatMode, type QueueTrack } from "@/stores/queue";
import useUpnp from "@/stores/upnp";
import { invalidateKeys } from "@/utils/invalidateKeys";
import { TOAST_DURATION } from "@/utils/toastDuration";
import { isLibraryTrack, isSpokenWordTrack } from "@/utils/trackSource";

const MUSIC_SEEK_SECONDS = 10;

type HitSlop = ComponentProps<typeof Pressable>["hitSlop"];

type ActionProps = {
  track: QueueTrack;
  size: number;
  hitSlop: HitSlop;
};

function stopPropagation(e: GestureResponderEvent) {
  e.stopPropagation?.();
}

function CastAction({ size, hitSlop }: Omit<ActionProps, "track">) {
  const { t } = useTranslation();
  const isOnline = useIsOnline();
  const capabilities = useCapabilities();
  const canCast = useCanCast();
  const jukeboxActive = useJukebox((s) => s.active);
  const upnpConnected = useUpnp((s) => s.connected);
  const casting = useCast((s) => s.active);
  const [white, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
  ]) as string[];
  // The sheet is worth opening when there is any output to pick between, not
  // only when the server happens to have a jukebox.
  if (!capabilities.jukebox && !canCast) return null;
  const playingRemotely = jukeboxActive || upnpConnected || casting;
  return (
    <Pressable
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={t("app.player.output")}
      disabled={!isOnline}
      style={{ opacity: isOnline ? 1 : 0.6 }}
      onPress={(e) => {
        stopPropagation(e);
        openOutputSheet();
      }}
    >
      <Cast size={size} color={playingRemotely ? emerald500 : white} />
    </Pressable>
  );
}

function PodcastFavoriteAction({
  podcastSeries,
  size,
  hitSlop,
}: Omit<ActionProps, "track"> & { podcastSeries: PodcastSeries }) {
  const { t } = useTranslation();
  const toast = useToast();
  const addFavoritePodcast = usePodcasts((store) => store.addFavoritePodcast);
  const removeFavoritePodcast = usePodcasts(
    (store) => store.removeFavoritePodcast,
  );
  const isFavorite = usePodcasts((store) =>
    store.favoritePodcasts.some((fav) => fav.uuid === podcastSeries.uuid),
  );

  const showSuccess = (messageKey: string) => {
    toast.show({
      placement: "top",
      duration: TOAST_DURATION.default,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>{t(messageKey)}</ToastDescription>
        </Toast>
      ),
    });
  };

  const handlePress = () => {
    if (isFavorite) {
      removeFavoritePodcast(podcastSeries.uuid);
      showSuccess("app.podcasts.removeFromFavoritesSuccessMessage");
    } else {
      addFavoritePodcast(podcastSeries);
      showSuccess("app.podcasts.addToFavoritesSuccessMessage");
    }
  };

  return (
    <AnimatedHeart
      size={size}
      hitSlop={hitSlop}
      filled={isFavorite}
      onPress={handlePress}
    />
  );
}

function TrackFavoriteAction({ track, size, hitSlop }: ActionProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const doFavorite = useStar();
  const doUnfavorite = useUnstar();

  const showToast = (action: "success" | "error", messageKey: string) => {
    toast.show({
      placement: "top",
      duration: TOAST_DURATION.default,
      render: () => (
        <Toast action={action}>
          <ToastTitle>
            {t(
              action === "success"
                ? "app.shared.toastSuccessTitle"
                : "app.shared.toastErrorTitle",
            )}
          </ToastTitle>
          <ToastDescription>{t(messageKey)}</ToastDescription>
        </Toast>
      ),
    });
  };

  const invalidateFavorites = () =>
    invalidateKeys(queryClient, [
      ["starred2"],
      ["starred"],
      ["album"],
      ["search3"],
    ]);

  const handleFavoritePress = () => {
    const trackId = track.id;
    const starredAt = new Date().toISOString();
    doFavorite.mutate(
      { id: trackId, song: track },
      {
        onSuccess: () => {
          const starredTrack = { ...track, starred: starredAt };
          queryClient.setQueriesData<{
            // biome-ignore lint/suspicious/noExplicitAny: cached subsonic response shape varies
            "subsonic-response"?: any;
          }>({ predicate: (q) => q.queryKey[0] === "starred2" }, (old) => {
            const body = old?.["subsonic-response"];
            if (!body?.starred2) return old;
            const existing = body.starred2.song ?? [];
            if (existing.some((s: { id: string }) => s.id === trackId))
              return old;
            return {
              ...old,
              "subsonic-response": {
                ...body,
                starred2: {
                  ...body.starred2,
                  song: [starredTrack, ...existing],
                },
              },
            };
          });
          invalidateFavorites();
          showToast("success", "app.tracks.favoriteSuccessMessage");
        },
        onError: () => showToast("error", "app.tracks.favoriteErrorMessage"),
      },
    );
  };

  const handleUnfavoritePress = () => {
    const trackId = track.id;
    doUnfavorite.mutate(
      { id: trackId, song: track },
      {
        onSuccess: () => {
          queryClient.setQueriesData<{
            // biome-ignore lint/suspicious/noExplicitAny: cached subsonic response shape varies
            "subsonic-response"?: any;
          }>({ predicate: (q) => q.queryKey[0] === "starred2" }, (old) => {
            const body = old?.["subsonic-response"];
            if (!body?.starred2) return old;
            return {
              ...old,
              "subsonic-response": {
                ...body,
                starred2: {
                  ...body.starred2,
                  song: body.starred2.song?.filter(
                    (s: { id: string }) => s.id !== trackId,
                  ),
                },
              },
            };
          });
          invalidateFavorites();
          showToast("success", "app.tracks.unfavoriteSuccessMessage");
        },
        onError: () => showToast("error", "app.tracks.unfavoriteErrorMessage"),
      },
    );
  };

  return (
    <AnimatedHeart
      size={size}
      hitSlop={hitSlop}
      filled={!!track.starred}
      onPress={track.starred ? handleUnfavoritePress : handleFavoritePress}
    />
  );
}

function ShuffleAction({ size, hitSlop }: Omit<ActionProps, "track">) {
  const shuffle = useQueue((s) => s.shuffle);
  const setShuffle = useQueue((s) => s.setShuffle);
  return (
    <ShuffleToggle
      active={shuffle}
      size={size}
      hitSlop={hitSlop}
      onPress={() => setShuffle(!shuffle)}
    />
  );
}

function RepeatAction({ size, hitSlop }: Omit<ActionProps, "track">) {
  const repeatMode = useQueue((s) => s.repeatMode);
  const setRepeatMode = useQueue((s) => s.setRepeatMode);
  return (
    <RepeatToggle
      mode={repeatMode}
      size={size}
      hitSlop={hitSlop}
      onPress={() => setRepeatMode(nextRepeatMode(repeatMode))}
    />
  );
}

function SkipAction({
  direction,
  size,
  hitSlop,
}: Omit<ActionProps, "track"> & { direction: "previous" | "next" }) {
  const { t } = useTranslation();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const Icon = direction === "previous" ? SkipBack : SkipForward;
  return (
    <Pressable
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={t(
        direction === "previous"
          ? "app.player.skipPrevious"
          : "app.player.skipNext",
      )}
      onPress={(e) => {
        stopPropagation(e);
        if (direction === "previous") skipPrevious();
        else skipNext();
      }}
    >
      <Icon size={size} color={white} fill={white} />
    </Pressable>
  );
}

export function SeekActionIcon({
  direction,
  seconds,
  size,
}: {
  direction: "backward" | "forward";
  seconds: number;
  size: number;
}) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const Icon = direction === "backward" ? RotateCcw : RotateCw;
  return (
    <Box
      className="items-center justify-center"
      style={{ width: size, height: size }}
    >
      <Icon size={size} color={white} strokeWidth={1.75} />
      <Box className="absolute inset-0 items-center justify-center">
        <Text
          className="text-white font-bold"
          style={{ fontSize: Math.round(size * 0.34) }}
        >
          {seconds}
        </Text>
      </Box>
    </Box>
  );
}

function SeekAction({
  track,
  direction,
  size,
  hitSlop,
}: ActionProps & { direction: "backward" | "forward" }) {
  const { t } = useTranslation();
  const spokenWord = isSpokenWordTrack(track);
  const seconds = !spokenWord
    ? MUSIC_SEEK_SECONDS
    : direction === "backward"
      ? PODCAST_SEEK_BACKWARD_SECONDS
      : PODCAST_SEEK_FORWARD_SECONDS;
  return (
    <Pressable
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={t(
        direction === "backward"
          ? "app.player.seekBackward"
          : "app.player.seekForward",
        { seconds },
      )}
      onPress={(e) => {
        stopPropagation(e);
        seekBy(direction === "backward" ? -seconds : seconds);
      }}
    >
      <SeekActionIcon direction={direction} seconds={seconds} size={size} />
    </Pressable>
  );
}

export default function FloatingPlayerActionButton({
  action,
  track,
  size,
  hitSlop,
}: ActionProps & { action: FloatingPlayerAction | null }) {
  if (!action) return null;
  if (action === "cast") return <CastAction size={size} hitSlop={hitSlop} />;
  if (track.isRadio) return null;
  switch (action) {
    case "favorite": {
      if (track.source === "podcast") {
        const podcastSeries = track.podcastSeries as PodcastSeries | null;
        if (!podcastSeries) return null;
        return (
          <PodcastFavoriteAction
            podcastSeries={podcastSeries}
            size={size}
            hitSlop={hitSlop}
          />
        );
      }
      if (!isLibraryTrack(track)) return null;
      return (
        <TrackFavoriteAction track={track} size={size} hitSlop={hitSlop} />
      );
    }
    case "shuffle":
      return isLibraryTrack(track) ? (
        <ShuffleAction size={size} hitSlop={hitSlop} />
      ) : null;
    case "repeat":
      return isLibraryTrack(track) ? (
        <RepeatAction size={size} hitSlop={hitSlop} />
      ) : null;
    case "skipPrevious":
    case "skipNext":
      return (
        <SkipAction
          direction={action === "skipPrevious" ? "previous" : "next"}
          size={size}
          hitSlop={hitSlop}
        />
      );
    case "seekBackward":
    case "seekForward":
      return (
        <SeekAction
          track={track}
          direction={action === "seekBackward" ? "backward" : "forward"}
          size={size}
          hitSlop={hitSlop}
        />
      );
  }
}
