import { LinearGradient } from "expo-linear-gradient";
import ListPlus from "lucide-react-native/dist/esm/icons/list-plus.mjs";
import Save from "lucide-react-native/dist/esm/icons/save.mjs";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import PlayPauseButton from "@/components/PlayPauseButton";
import SaveGeneratedPlaylistDialog, {
  type SavePlaylistTarget,
} from "@/components/playlists/SaveGeneratedPlaylistDialog";
import ShuffleToggle from "@/components/ShuffleToggle";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useHasPlayableTracks } from "@/hooks/offline";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import type { Child } from "@/services/openSubsonic/types";
import {
  enqueueWithoutAutoplay,
  playTracks,
  togglePlayPause,
} from "@/services/player";
import useQueue, { type QueueSource } from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";

// The action bar over a track list the app generated rather than fetched: it has
// no server id, so there is nothing to star or navigate back to — only play it,
// shuffle it, queue it, or turn it into a real playlist.
export default function GeneratedTrackListActions({
  tracks,
  source,
  canSave = true,
  defaultPlaylistName,
  saveTarget,
  queuedMessage,
  footer,
}: {
  tracks: Child[];
  source: QueueSource;
  canSave?: boolean;
  /** Pre-fills the save dialog when the generator implies a name. */
  defaultPlaylistName?: string;
  /** Forces the playlist writer; omit to follow the AudioMuse preference. */
  saveTarget?: SavePlaylistTarget;
  queuedMessage: (count: number) => string;
  /** Rendered under the actions — e.g. a caveat about what will be saved. */
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const [white, gray500, primary800] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-500",
    // The screens behind these actions are all bg-primary-800, and it flips with
    // the theme — so the edge fade reads the token rather than hardcoding black.
    "--color-primary-800",
  ]) as string[];
  const { showSuccessToast } = useSettingsToast();
  const [isSaveOpen, setIsSaveOpen] = useState(false);

  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const hasPlayableTracks = useHasPlayableTracks(tracks);
  const shuffle = useQueue((store) => store.shuffle);
  const setShuffle = useQueue((store) => store.setShuffle);

  const trackIdSet = useMemo(
    () => new Set(tracks.map((track) => track.id)),
    [tracks],
  );
  const isPlayingFromList = !!(playingTrack && trackIdSet.has(playingTrack.id));

  const handlePlayPress = () => {
    if (isPlayingFromList) {
      togglePlayPause();
      return;
    }
    if (!tracks.length) return;
    // shuffleFromRandom, so pressing play with shuffle on doesn't always open on
    // the same first track before the shuffled order takes over.
    playTracks(tracks.map(childToTrack), 0, {
      shuffleFromRandom: true,
      source,
    });
  };

  const handleQueuePress = () => {
    if (!tracks.length) return;
    const added = enqueueWithoutAutoplay(tracks.map(childToTrack));
    if (added === 0) return;
    showSuccessToast(queuedMessage(added));
  };

  const hasTracks = tracks.length > 0;
  const actionColor = hasTracks ? white : gray500;

  return (
    <>
      <VStack className="gap-y-3">
        {/* Edge to edge, so the row reads as scrollable rather than clipped:
            the labels are full sentences in some locales ("Enregistrer comme
            playlist") and never fit side by side on a phone. The component owns
            the horizontal padding for that reason — callers must not pad it. */}
        <Box className="relative">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="grow-0"
            contentContainerStyle={{ paddingHorizontal: 24 }}
          >
            <HStack className="items-center gap-x-6">
              {canSave && (
                <FadeOutScaleDown
                  onPress={hasTracks ? () => setIsSaveOpen(true) : undefined}
                >
                  <HStack className="items-center gap-x-2">
                    <Save size={16} color={actionColor} />
                    <Text className="text-white font-bold">
                      {t("app.audiomuse.results.saveAction")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
              <FadeOutScaleDown
                onPress={hasTracks ? handleQueuePress : undefined}
              >
                <HStack className="items-center gap-x-2">
                  <ListPlus size={16} color={actionColor} />
                  <Text className="text-white font-bold">
                    {t("app.audiomuse.results.queueAction")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            </HStack>
          </ScrollView>
          <LinearGradient
            colors={[primary800, "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 24,
            }}
          />
          <LinearGradient
            colors={["transparent", primary800]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            pointerEvents="none"
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 24,
            }}
          />
        </Box>
        <HStack className="items-center justify-end gap-x-4 px-6">
          <ShuffleToggle
            active={shuffle}
            onPress={() => setShuffle(!shuffle)}
          />
          <PlayPauseButton
            isPlaying={isPlayingFromList && isPlaying}
            onPress={handlePlayPress}
            size={48}
            iconSize={24}
            color={white}
            className="bg-emerald-500"
            disabled={!isPlayingFromList && !hasPlayableTracks}
          />
        </HStack>
        {footer && <Box className="px-6">{footer}</Box>}
      </VStack>
      <SaveGeneratedPlaylistDialog
        isOpen={isSaveOpen}
        onClose={() => setIsSaveOpen(false)}
        trackIds={tracks.map((track) => track.id)}
        defaultName={defaultPlaylistName}
        target={saveTarget}
      />
    </>
  );
}
