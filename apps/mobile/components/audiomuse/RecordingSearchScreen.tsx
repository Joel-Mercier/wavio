import {
  type RecordingOptions,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import Mic from "lucide-react-native/icons/mic";
import Square from "lucide-react-native/icons/square";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import AudioMuseResults from "@/components/audiomuse/AudioMuseResults";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useHydratedTracks } from "@/hooks/audioMuse/useHydratedTracks";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { audioMuseErrorMessage } from "@/services/audioMuse";
import {
  RECORDING_MIN_SECONDS,
  RECORDING_SECONDS,
  searchByRecording,
  warmUpRecordingSearch,
} from "@/services/audioMuse/recording";
import {
  findSimilarTracks,
  SIMILAR_DEFAULT_RESULTS,
} from "@/services/audioMuse/similar";
import type { AudioMuseRecordingMatch } from "@/services/audioMuse/types";
import { reportError } from "@/services/errorReporting";
import { beginRecordingSession, playTracks } from "@/services/player";
import type { QueueSource } from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";
import { goBackOrHome } from "@/utils/navigation";

// Mono is all the fingerprint reads. On Android, the voice-recognition source is
// the one the CDD requires to ship without noise suppression or automatic gain,
// both of which flatten music into something that no longer matches; it is also
// supported everywhere, unlike the unprocessed source.
const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    audioSource: "voice_recognition",
  },
};

type Phase = "idle" | "recording" | "searching";

interface Outcome {
  /** The library track the clip is, when AudioMuse is sure enough to say. */
  identified: AudioMuseRecordingMatch | null;
  /** Similar tracks when identified, otherwise the closest candidates. */
  itemIds: string[];
}

// The clip is the user's surroundings, so it never outlives the search.
function discardClip(uri: string | null) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    reportError(error, { area: "storage", extra: { op: "discardClip" } });
  }
}

export default function RecordingSearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const { showErrorToast } = useSettingsToast();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];

  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<Phase>("idle");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const endSessionRef = useRef<(() => Promise<void>) | null>(null);
  const finishingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const elapsedSeconds = Math.floor(recorderState.durationMillis / 1000);
  const remainingSeconds = Math.max(0, RECORDING_SECONDS - elapsedSeconds);

  const identifiedIds = useMemo(
    () => (outcome?.identified ? [outcome.identified.item_id] : []),
    [outcome],
  );
  const { data: identifiedTracks, isLoading: isHydratingIdentified } =
    useHydratedTracks(identifiedIds);
  const identifiedTrack = identifiedTracks?.[0];

  const title = outcome?.identified
    ? (identifiedTrack?.title ?? outcome.identified.title ?? "")
    : "";
  const source = useMemo<QueueSource>(
    () => ({ type: "audiomuse", name: t("app.audiomuse.recording.title") }),
    [t],
  );

  // Loads the fingerprint encoder while the user is still getting the phone
  // near the speaker, so the search itself doesn't pay for it.
  useEffect(() => {
    void warmUpRecordingSearch();
  }, []);

  const releaseSession = useCallback(async () => {
    const end = endSessionRef.current;
    endSessionRef.current = null;
    if (!end) return;
    try {
      await end();
    } catch (error) {
      reportError(error, { area: "player", extra: { op: "endRecording" } });
    }
  }, []);

  // Leaving mid-recording must still give the audio session back and resume
  // whatever the recording paused, and must not leave the clip behind.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (!endSessionRef.current) return;
      let uri: string | null = null;
      recorder
        .stop()
        .then(() => {
          uri = recorder.uri;
        })
        .catch(() => {})
        .finally(() => {
          discardClip(uri);
          void releaseSession();
        });
    },
    [recorder, releaseSession],
  );

  const finishRecording = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setPhase("searching");

    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch (error) {
      reportError(error, { area: "player", extra: { op: "stopRecording" } });
    }
    await releaseSession();
    if (!uri) {
      setPhase("idle");
      showErrorToast(t("app.audiomuse.recording.recordFailed"));
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const matches = await searchByRecording({
        uri,
        signal: controller.signal,
      });
      const best = matches[0];
      if (best?.identified) {
        // A failed similarity search shouldn't cost the user the answer they
        // recorded for; the match alone is still worth showing.
        const similar = await findSimilarTracks({
          itemId: best.item_id,
          numResults: SIMILAR_DEFAULT_RESULTS,
          limitPerArtist: true,
          radiusSimilarity: true,
          signal: controller.signal,
        }).catch(() => []);
        setOutcome({
          identified: best,
          itemIds: similar.map((track) => track.item_id),
        });
      } else {
        setOutcome({
          identified: null,
          itemIds: matches.map((match) => match.item_id),
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        // AudioMuse says what was wrong with the clip ("The clip is silent.") or
        // the deployment (an index not loaded yet); both beat a generic failure.
        showErrorToast(
          audioMuseErrorMessage(error) ??
            t("app.audiomuse.recording.searchFailed"),
        );
      }
    } finally {
      discardClip(uri);
      abortRef.current = null;
      setPhase("idle");
    }
  }, [recorder, releaseSession, showErrorToast, t]);

  useEffect(() => {
    if (
      phase === "recording" &&
      recorderState.durationMillis >= RECORDING_SECONDS * 1000
    ) {
      void finishRecording();
    }
  }, [phase, recorderState.durationMillis, finishRecording]);

  const handleRecord = async () => {
    if (phase !== "idle") return;
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setPermissionDenied(true);
      return;
    }
    setPermissionDenied(false);
    setOutcome(null);
    try {
      endSessionRef.current = await beginRecordingSession();
      await recorder.prepareToRecordAsync();
      recorder.record();
      finishingRef.current = false;
      setPhase("recording");
    } catch (error) {
      await releaseSession();
      reportError(error, { area: "player", extra: { op: "startRecording" } });
      showErrorToast(t("app.audiomuse.recording.recordFailed"));
    }
  };

  const handleIdentifiedPress = () => {
    if (identifiedTrack) {
      playTracks([childToTrack(identifiedTrack)], 0, { source });
    }
  };

  const resultsHeader = outcome?.identified ? (
    <VStack className="gap-y-2">
      <Heading className="text-white px-6" size="md">
        {t("app.audiomuse.recording.foundIt")}
      </Heading>
      {identifiedTrack ? (
        <TrackListItem
          track={identifiedTrack}
          index={0}
          onPress={handleIdentifiedPress}
          showCoverArt
          className="px-6"
        />
      ) : isHydratingIdentified ? (
        <TrackListItemSkeleton index={0} className="px-6" />
      ) : (
        <Text className="text-primary-100 px-6">
          {[outcome.identified.title, outcome.identified.author]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      )}
      <Heading className="text-white px-6 mt-4" size="md">
        {t("app.audiomuse.recording.similarHeading")}
      </Heading>
    </VStack>
  ) : (
    <Text className="text-primary-100 text-sm px-6">
      {t("app.audiomuse.recording.notIdentified")}
    </Text>
  );

  return (
    <Box className="h-full bg-primary-800">
      <HStack
        className="items-center gap-x-4 px-6 pb-4"
        style={{ paddingTop: insets.top + 16 }}
      >
        <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
          <ArrowLeft size={24} color={white} />
        </FadeOutScaleDown>
        <Heading
          className="text-white font-bold text-center truncate flex-1 mx-2"
          size="lg"
          numberOfLines={1}
        >
          {t("app.audiomuse.recording.title")}
        </Heading>
        {/* Balances the back arrow so the title centers on the screen, not on
            the space left over beside it. */}
        <Box className="w-6" />
      </HStack>

      {outcome ? (
        <VStack className="flex-1">
          <HStack className="items-center justify-end px-6 pb-4">
            <FadeOutScaleDown
              onPress={() => setOutcome(null)}
              className="items-center justify-center py-2 px-4 border border-primary-400 rounded-full"
            >
              <Text className="text-white text-sm font-bold">
                {t("app.audiomuse.recording.recordAgain")}
              </Text>
            </FadeOutScaleDown>
          </HStack>
          <AudioMuseResults
            header={resultsHeader}
            itemIds={outcome.itemIds}
            source={source}
            emptyMessage={t(
              outcome.identified
                ? "app.audiomuse.recording.noSimilar"
                : "app.audiomuse.recording.noMatches",
            )}
            defaultPlaylistName={
              title
                ? t("app.audiomuse.recording.playlistName", { title })
                : undefined
            }
          />
        </VStack>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: screenBottomPadding,
          }}
        >
          <VStack className="gap-y-8 items-center">
            <Text className="text-primary-100 text-sm self-stretch">
              {t("app.audiomuse.recording.description", {
                seconds: RECORDING_SECONDS,
              })}
            </Text>

            {phase === "searching" ? (
              <VStack className="items-center gap-y-4 py-12">
                <Spinner color={white} size="large" />
                <Text className="text-white">
                  {t("app.audiomuse.recording.searching")}
                </Text>
              </VStack>
            ) : phase === "recording" ? (
              <VStack className="items-center gap-y-6">
                <Box className="w-40 h-40 rounded-full bg-emerald-500 items-center justify-center">
                  <Text className="text-primary-800 font-bold text-5xl">
                    {remainingSeconds}
                  </Text>
                </Box>
                <Text className="text-white">
                  {t("app.audiomuse.recording.listening")}
                </Text>
                <FadeOutScaleDown
                  onPress={() => void finishRecording()}
                  disabled={elapsedSeconds < RECORDING_MIN_SECONDS}
                  className="items-center justify-center py-3 px-8 border border-primary-400 rounded-full"
                >
                  <HStack className="items-center gap-x-2">
                    <Square size={16} color={white} />
                    <Text className="text-white font-bold">
                      {t("app.audiomuse.recording.stop")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              </VStack>
            ) : (
              <VStack className="items-center gap-y-4">
                <FadeOutScaleDown
                  onPress={handleRecord}
                  className="w-40 h-40 rounded-full bg-emerald-500 items-center justify-center"
                >
                  <Mic size={64} color="rgb(41, 41, 41)" />
                </FadeOutScaleDown>
                <Text className="text-white font-bold text-lg">
                  {t("app.audiomuse.recording.action")}
                </Text>
              </VStack>
            )}

            {permissionDenied && phase === "idle" && (
              <VStack className="items-center gap-y-3 self-stretch">
                <Text className="text-primary-100 text-sm text-center">
                  {t("app.audiomuse.recording.permissionDenied")}
                </Text>
                <FadeOutScaleDown
                  onPress={() => void Linking.openSettings()}
                  className="items-center justify-center py-2 px-4 border border-primary-400 rounded-full"
                >
                  <Text className="text-white text-sm font-bold">
                    {t("app.audiomuse.recording.openSettings")}
                  </Text>
                </FadeOutScaleDown>
              </VStack>
            )}
          </VStack>
        </ScrollView>
      )}
    </Box>
  );
}
