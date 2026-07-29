import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import ChevronRight from "lucide-react-native/dist/esm/icons/chevron-right.mjs";
import Route from "lucide-react-native/dist/esm/icons/route.mjs";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import AudioMuseResults from "@/components/audiomuse/AudioMuseResults";
import PathEndpointSheet, {
  usePathEndpointLabel,
} from "@/components/audiomuse/PathEndpointSheet";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import {
  SettingsStepperRow,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { audioMuseErrorMessage } from "@/services/audioMuse";
import {
  clampMoodPct,
  clampPathLength,
  findSongPath,
  isResolvedEndpoint,
  PATH_DEFAULT_LENGTH,
  PATH_DEFAULT_MOOD_PCT,
  PATH_MAX_LENGTH,
  PATH_MIN_LENGTH,
  PATH_MOOD_PCT_STEP,
  type PathEndpoint,
} from "@/services/audioMuse/path";
import useAudioMuse, { selectLyricsPathAvailable } from "@/stores/audioMuse";
import type { QueueSource } from "@/stores/queue";
import { goBackOrHome } from "@/utils/navigation";

// A playlist that travels from one point in the library to another, each song a
// small step from the last. Both ends are picked here rather than arriving as
// route params — except the start, which the track action sheet can pre-fill.
export default function SongPathScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const { showErrorToast } = useSettingsToast();
  const [white, primary50, primary100] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-primary-50",
    "--color-primary-100",
  ]) as string[];
  const endpointLabel = usePathEndpointLabel();
  const lyricsAvailable = useAudioMuse(selectLyricsPathAvailable);

  const { startId, startTitle, startAuthor } = useLocalSearchParams<{
    startId?: string;
    startTitle?: string;
    startAuthor?: string;
  }>();

  // Seeded once from the route so a user who then picks a different start isn't
  // fought by the params on the next render.
  const [start, setStart] = useState<PathEndpoint | null>(() =>
    startId
      ? {
          kind: "song",
          itemId: startId,
          title: startTitle,
          author: startAuthor,
        }
      : null,
  );
  const [end, setEnd] = useState<PathEndpoint | null>(null);
  const [lyrics, setLyrics] = useState(false);
  const [moodPct, setMoodPct] = useState(PATH_DEFAULT_MOOD_PCT);
  // Held as text so the field can be emptied while typing; the clamp runs on
  // blur and again before the request.
  const [lengthText, setLengthText] = useState(String(PATH_DEFAULT_LENGTH));
  const [fixSize, setFixSize] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [itemIds, setItemIds] = useState<string[] | null>(null);
  const [pickerSide, setPickerSide] = useState<"start" | "end">("start");
  const abortRef = useRef<AbortController | null>(null);
  const pickerRef = useRef<BottomSheetModal | null>(null);

  const startLabel = endpointLabel(start);
  const endLabel = endpointLabel(end);
  const hasResolvedEndpoint =
    isResolvedEndpoint(start) || isResolvedEndpoint(end);

  const heading = useMemo(
    () =>
      startLabel && endLabel
        ? t("app.audiomuse.path.heading", {
            start: startLabel,
            end: endLabel,
          })
        : t("app.audiomuse.path.title"),
    [startLabel, endLabel, t],
  );

  const source = useMemo<QueueSource>(
    () => ({ type: "audiomuse", name: heading }),
    [heading],
  );

  const handleOpenPicker = (side: "start" | "end") => {
    setPickerSide(side);
    pickerRef.current?.present();
  };

  const handleSelectEndpoint = (endpoint: PathEndpoint) => {
    if (pickerSide === "start") {
      setStart(endpoint);
    } else {
      setEnd(endpoint);
    }
  };

  // Lyrics walks a space that only holds real tracks, so turning it on drops any
  // mood or anchor rather than letting the request be refused for it.
  const handleLyricsToggle = (value: boolean) => {
    setLyrics(value);
    if (!value) return;
    if (isResolvedEndpoint(start)) setStart(null);
    if (isResolvedEndpoint(end)) setEnd(null);
  };

  const handleLengthBlur = () => {
    setLengthText(String(clampPathLength(Number(lengthText))));
  };

  const handleGenerate = async () => {
    if (isGenerating || !start || !end) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);
    setItemIds(null);
    try {
      const tracks = await findSongPath({
        start,
        end,
        length: Number(lengthText),
        fixSize,
        lyrics,
        moodPct,
        signal: controller.signal,
      });
      setItemIds(tracks.map((track) => track.item_id));
    } catch (error) {
      if (!controller.signal.aborted) {
        // AudioMuse names the reason it refused ("No path found between the
        // selected songs within 25 steps.", "One or both selected songs are not
        // in the Lyrics index"); relaying it beats a generic failure the user
        // can't act on.
        showErrorToast(
          audioMuseErrorMessage(error) ?? t("app.audiomuse.path.failed"),
        );
      }
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    abortRef.current?.abort();
    setItemIds(null);
  };

  const renderEndpointRow = (side: "start" | "end", label: string | null) => (
    <FadeOutScaleDown
      onPress={() => handleOpenPicker(side)}
      disabled={isGenerating}
    >
      <HStack className="items-center gap-x-4 py-4 justify-between">
        <VStack className="gap-y-2 flex-1">
          <Heading className="text-white font-normal" size="md">
            {t(`app.audiomuse.path.${side}Label`)}
          </Heading>
          <Text
            className={
              label ? "text-white text-sm" : "text-primary-100 text-sm"
            }
            numberOfLines={1}
          >
            {label ?? t("app.audiomuse.path.choosePlaceholder")}
          </Text>
        </VStack>
        <ChevronRight size={20} color={primary100} />
      </HStack>
    </FadeOutScaleDown>
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
          {heading}
        </Heading>
        {/* Balances the back arrow so the title centers on the screen, not on
            the space left over beside it. */}
        <Box className="w-6" />
      </HStack>

      {itemIds ? (
        <VStack className="flex-1">
          <HStack className="items-center justify-end px-6 pb-4">
            <FadeOutScaleDown
              onPress={handleReset}
              className="items-center justify-center py-2 px-4 border border-primary-400 rounded-full"
            >
              <Text className="text-white text-sm font-bold">
                {t("app.audiomuse.path.newPath")}
              </Text>
            </FadeOutScaleDown>
          </HStack>
          <AudioMuseResults
            itemIds={itemIds}
            source={source}
            emptyMessage={t("app.audiomuse.path.noResults")}
            defaultPlaylistName={heading}
          />
        </VStack>
      ) : (
        <KeyboardAwareScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: screenBottomPadding,
          }}
        >
          <VStack className="gap-y-2">
            <Text className="text-primary-100 text-sm">
              {t("app.audiomuse.path.description")}
            </Text>
            {renderEndpointRow("start", startLabel)}
            {renderEndpointRow("end", endLabel)}
            {lyricsAvailable && (
              <SettingsToggleRow
                label={t("app.audiomuse.path.lyricsLabel")}
                description={t("app.audiomuse.path.lyricsDescription")}
                value={lyrics}
                onToggle={handleLyricsToggle}
                disabled={isGenerating}
              />
            )}
            {/* Only means anything once one end is a mood or an anchor: it is how
                far that end travels from the other one. */}
            {hasResolvedEndpoint && (
              <SettingsStepperRow
                label={t("app.audiomuse.path.blendLabel")}
                description={t("app.audiomuse.path.blendDescription")}
                valueText={`${moodPct}%`}
                onDecrement={() =>
                  setMoodPct((pct) => clampMoodPct(pct - PATH_MOOD_PCT_STEP))
                }
                onIncrement={() =>
                  setMoodPct((pct) => clampMoodPct(pct + PATH_MOOD_PCT_STEP))
                }
                valueClassName="w-14"
                disabled={isGenerating}
              />
            )}
            <VStack className="gap-y-2 py-4">
              <Heading className="text-white font-normal" size="md">
                {t("app.audiomuse.path.lengthLabel")}
              </Heading>
              <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 rounded-md px-4 py-2">
                <InputField
                  value={lengthText}
                  onChangeText={setLengthText}
                  onBlur={handleLengthBlur}
                  className="text-md text-white"
                  placeholder={String(PATH_DEFAULT_LENGTH)}
                  placeholderTextColor={primary50}
                  keyboardType="number-pad"
                  editable={!isGenerating}
                />
              </Input>
              <Text className="text-primary-100 text-sm">
                {t("app.audiomuse.path.lengthHint", {
                  min: PATH_MIN_LENGTH,
                  max: PATH_MAX_LENGTH,
                })}
              </Text>
            </VStack>
            <SettingsToggleRow
              label={t("app.audiomuse.path.fixSizeLabel")}
              description={t("app.audiomuse.path.fixSizeDescription")}
              value={fixSize}
              onToggle={setFixSize}
              disabled={isGenerating}
            />
            <FadeOutScaleDown
              onPress={handleGenerate}
              disabled={isGenerating || !start || !end}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full self-center mt-2"
            >
              {isGenerating ? (
                <Spinner color="rgb(41, 41, 41)" />
              ) : (
                <HStack className="items-center gap-x-2">
                  <Route size={20} color="rgb(41, 41, 41)" />
                  <Text className="text-primary-800 font-bold text-lg">
                    {t("app.audiomuse.path.action")}
                  </Text>
                </HStack>
              )}
            </FadeOutScaleDown>
          </VStack>
        </KeyboardAwareScrollView>
      )}

      <PathEndpointSheet
        ref={pickerRef}
        title={t(`app.audiomuse.path.${pickerSide}Label`)}
        lyrics={lyrics}
        otherIsResolved={isResolvedEndpoint(
          pickerSide === "start" ? end : start,
        )}
        onSelect={handleSelectEndpoint}
      />
    </Box>
  );
}
