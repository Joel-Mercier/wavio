import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import Drama from "lucide-react-native/dist/esm/icons/drama.mjs";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import AudioMuseResults from "@/components/audiomuse/AudioMuseResults";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import OptionsBottomSheetModal, {
  type SheetOption,
} from "@/components/settings/OptionsBottomSheetModal";
import {
  SettingsSelectRow,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useAudioMuseAnchors } from "@/hooks/audioMuse/useAudioMuseAnchors";
import { useMoodCentroids } from "@/hooks/audioMuse/useMoodCentroids";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { audioMuseErrorMessage } from "@/services/audioMuse";
import {
  clampSimilarResults,
  findSimilarToSeed,
  SIMILAR_DEFAULT_RESULTS,
  SIMILAR_MAX_RESULTS,
  SIMILAR_MIN_RESULTS,
  type SimilaritySeed,
} from "@/services/audioMuse/similar";
import type { AudioMuseMoodCentroid } from "@/services/audioMuse/types";
import type { QueueSource } from "@/stores/queue";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

type SeedMode = "mood" | "anchor";

// How many of a cluster's tags name it in the picker. It carries five, but the
// tail is weak enough that showing it makes every row read alike.
const LABEL_TAG_COUNT = 3;

function centroidLabel(centroid: AudioMuseMoodCentroid): string {
  const tags = (centroid.top_tags ?? []).slice(0, LABEL_TAG_COUNT);
  return tags.length ? tags.join(" · ") : `#${centroid.index + 1}`;
}

/**
 * A playlist built around a point in AudioMuse's embedding space rather than a
 * song: one cluster of a mood, or an anchor saved from its Alchemy page. This is
 * the same nearest-neighbour search the track action sheet runs, seeded
 * differently — so it ends in the same result list.
 */
export default function MoodPlaylistScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const { showErrorToast } = useSettingsToast();
  const [white, primary50] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-primary-50",
  ]) as string[];

  const {
    data: moodCentroids,
    isLoading: isLoadingMoods,
    isError: moodsFailed,
    refetch: refetchMoods,
  } = useMoodCentroids();
  const { data: anchors } = useAudioMuseAnchors();

  const [mode, setMode] = useState<SeedMode>("mood");
  const [mood, setMood] = useState<string | null>(null);
  const [centroidIndex, setCentroidIndex] = useState<number | null>(null);
  const [anchorId, setAnchorId] = useState<number | null>(null);
  // Held as text so the field can be emptied while typing; the clamp runs on
  // blur and again before the request.
  const [countText, setCountText] = useState(String(SIMILAR_DEFAULT_RESULTS));
  const [limitPerArtist, setLimitPerArtist] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [itemIds, setItemIds] = useState<string[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const moodSheetRef = useRef<BottomSheetModal>(null);
  const centroidSheetRef = useRef<BottomSheetModal>(null);
  const anchorSheetRef = useRef<BottomSheetModal>(null);

  const moodNames = useMemo(
    () => Object.keys(moodCentroids ?? {}).sort(),
    [moodCentroids],
  );
  // Biggest cluster first: it is the one the mood is most representative of, and
  // it makes the default pick below the least surprising one.
  const centroids = useMemo(
    () =>
      [...((mood && moodCentroids?.[mood]) || [])].sort(
        (a, b) => (b.n_songs ?? 0) - (a.n_songs ?? 0),
      ),
    [mood, moodCentroids],
  );

  const moodOptions = useMemo<SheetOption<string>[]>(
    () =>
      moodNames.map((name) => ({
        value: name,
        label: t(`app.audiomuse.mood.moods.${name}`, { defaultValue: name }),
        description: t("app.audiomuse.mood.styleCount", {
          count: moodCentroids?.[name]?.length ?? 0,
        }),
      })),
    [moodNames, moodCentroids, t],
  );

  const centroidOptions = useMemo<SheetOption<number>[]>(
    () =>
      centroids.map((centroid) => ({
        value: centroid.index,
        label: centroidLabel(centroid),
        description: centroid.n_songs
          ? t("app.audiomuse.mood.styleSongs", { count: centroid.n_songs })
          : undefined,
      })),
    [centroids, t],
  );

  const anchorOptions = useMemo<SheetOption<number>[]>(
    () => (anchors ?? []).map((a) => ({ value: a.id, label: a.name })),
    [anchors],
  );

  const modes = useMemo<SeedMode[]>(
    () => (anchorOptions.length ? ["mood", "anchor"] : ["mood"]),
    [anchorOptions],
  );
  // The anchor mode can disappear under the screen (the list empties on a
  // refetch), which would otherwise strand it on a picker it can't switch away
  // from, since the switcher is only rendered while both modes are offered.
  const activeMode = modes.includes(mode) ? mode : "mood";

  const selectedMoodLabel = mood
    ? t(`app.audiomuse.mood.moods.${mood}`, { defaultValue: mood })
    : null;
  const selectedCentroid = centroids.find((c) => c.index === centroidIndex);
  const selectedAnchor = (anchors ?? []).find((a) => a.id === anchorId);

  const seed = useMemo<SimilaritySeed | null>(() => {
    if (activeMode === "anchor") {
      return anchorId === null ? null : { kind: "anchor", id: anchorId };
    }
    if (!mood || centroidIndex === null) return null;
    return { kind: "mood", mood, centroidIndex };
  }, [activeMode, mood, centroidIndex, anchorId]);

  // Names what the playlist was built from, which is also what the save dialog
  // pre-fills. A mood with no cluster to name it falls back to the mood alone
  // rather than to a heading trailing its separator.
  const heading =
    activeMode === "anchor"
      ? (selectedAnchor?.name ?? t("app.audiomuse.mood.title"))
      : !selectedMoodLabel
        ? t("app.audiomuse.mood.title")
        : selectedCentroid
          ? t("app.audiomuse.mood.heading", {
              mood: selectedMoodLabel,
              style: centroidLabel(selectedCentroid),
            })
          : selectedMoodLabel;

  const source = useMemo<QueueSource>(
    () => ({ type: "audiomuse", name: heading }),
    [heading],
  );

  // Every mood carries dozens of clusters and the endpoint requires one, so
  // picking a mood also picks its largest — the user only opens the style sheet
  // when they want a different flavour of it.
  const handleSelectMood = (next: string) => {
    setMood(next);
    const largest = [...(moodCentroids?.[next] ?? [])].sort(
      (a, b) => (b.n_songs ?? 0) - (a.n_songs ?? 0),
    )[0];
    setCentroidIndex(largest ? largest.index : null);
  };

  const handleCountBlur = () => {
    setCountText(String(clampSimilarResults(Number(countText))));
  };

  const handleGenerate = async () => {
    if (isGenerating || !seed) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);
    setItemIds(null);
    try {
      const tracks = await findSimilarToSeed({
        seed,
        numResults: Number(countText),
        limitPerArtist,
        signal: controller.signal,
      });
      setItemIds(tracks.map((track) => track.item_id));
    } catch (error) {
      if (!controller.signal.aborted) {
        // AudioMuse names the reason it refused ("Anchor with id 3 not found or
        // has no centroid.", "Invalid server selection."); relaying it beats a
        // generic failure the user can't act on.
        showErrorToast(
          audioMuseErrorMessage(error) ?? t("app.audiomuse.mood.failed"),
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
                {t("app.audiomuse.mood.newSearch")}
              </Text>
            </FadeOutScaleDown>
          </HStack>
          <AudioMuseResults
            itemIds={itemIds}
            source={source}
            emptyMessage={t("app.audiomuse.mood.noResults")}
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
              {t("app.audiomuse.mood.description")}
            </Text>
            {modes.length > 1 && (
              <HStack className="gap-x-2 py-2">
                {modes.map((value) => (
                  <FadeOutScaleDown
                    key={value}
                    onPress={() => setMode(value)}
                    disabled={isGenerating}
                  >
                    <Badge
                      className={cn(
                        "rounded-full bg-primary-500 px-4 py-1",
                        activeMode === value && "bg-emerald-500",
                      )}
                    >
                      <BadgeText
                        className={cn(
                          "normal-case text-md",
                          activeMode === value
                            ? "text-primary-800"
                            : "text-white",
                        )}
                      >
                        {t(`app.audiomuse.mood.modes.${value}`)}
                      </BadgeText>
                    </Badge>
                  </FadeOutScaleDown>
                ))}
              </HStack>
            )}

            {activeMode === "mood" ? (
              <>
                <SettingsSelectRow
                  label={t("app.audiomuse.mood.moodLabel")}
                  description={t("app.audiomuse.mood.moodDescription")}
                  badgeText={
                    selectedMoodLabel ??
                    t(
                      isLoadingMoods
                        ? "app.audiomuse.mood.loading"
                        : "app.audiomuse.mood.choosePlaceholder",
                    )
                  }
                  onPress={() => moodSheetRef.current?.present()}
                  disabled={isGenerating || !moodNames.length}
                />
                {/* The endpoint needs a cluster, not just a mood, so this is only
                    ever a refinement of the one picking a mood already made. */}
                {!!mood && (
                  <SettingsSelectRow
                    label={t("app.audiomuse.mood.styleLabel")}
                    description={t("app.audiomuse.mood.styleDescription")}
                    badgeText={
                      selectedCentroid
                        ? centroidLabel(selectedCentroid)
                        : t("app.audiomuse.mood.choosePlaceholder")
                    }
                    onPress={() => centroidSheetRef.current?.present()}
                    disabled={isGenerating || !centroidOptions.length}
                  />
                )}
              </>
            ) : (
              <SettingsSelectRow
                label={t("app.audiomuse.mood.anchorLabel")}
                description={t("app.audiomuse.mood.anchorDescription")}
                badgeText={
                  selectedAnchor?.name ??
                  t("app.audiomuse.mood.choosePlaceholder")
                }
                onPress={() => anchorSheetRef.current?.present()}
                disabled={isGenerating}
              />
            )}

            {/* A failed catalogue fetch leaves the same empty list as a
                deployment that holds no moods at all, so it is told apart here
                rather than reported as a limitation the user can't retry. */}
            {activeMode === "mood" &&
              !isLoadingMoods &&
              !moodNames.length &&
              (moodsFailed ? (
                <VStack className="gap-y-2 items-start">
                  <Text className="text-primary-100 text-sm">
                    {t("app.audiomuse.mood.loadFailed")}
                  </Text>
                  <FadeOutScaleDown
                    onPress={() => refetchMoods()}
                    className="items-center justify-center py-2 px-4 border border-primary-400 rounded-full"
                  >
                    <Text className="text-white text-sm font-bold">
                      {t("app.audiomuse.mood.retry")}
                    </Text>
                  </FadeOutScaleDown>
                </VStack>
              ) : (
                <Text className="text-primary-100 text-sm">
                  {t("app.audiomuse.mood.unavailable")}
                </Text>
              ))}

            <VStack className="gap-y-2 py-4">
              <Heading className="text-white font-normal" size="md">
                {t("app.audiomuse.mood.countLabel")}
              </Heading>
              <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 rounded-md px-4 py-2">
                <InputField
                  value={countText}
                  onChangeText={setCountText}
                  onBlur={handleCountBlur}
                  className="text-md text-white"
                  placeholder={String(SIMILAR_DEFAULT_RESULTS)}
                  placeholderTextColor={primary50}
                  keyboardType="number-pad"
                  editable={!isGenerating}
                />
              </Input>
              <Text className="text-primary-100 text-sm">
                {t("app.audiomuse.mood.countHint", {
                  min: SIMILAR_MIN_RESULTS,
                  max: SIMILAR_MAX_RESULTS,
                })}
              </Text>
            </VStack>
            <SettingsToggleRow
              label={t("app.audiomuse.mood.limitPerArtistLabel")}
              description={t("app.audiomuse.mood.limitPerArtistDescription")}
              value={limitPerArtist}
              onToggle={setLimitPerArtist}
              disabled={isGenerating}
            />
            <FadeOutScaleDown
              onPress={handleGenerate}
              disabled={isGenerating || !seed}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full self-center mt-2"
            >
              {isGenerating ? (
                <Spinner color="rgb(41, 41, 41)" />
              ) : (
                <HStack className="items-center gap-x-2">
                  <Drama size={20} color="rgb(41, 41, 41)" />
                  <Text className="text-primary-800 font-bold text-lg">
                    {t("app.audiomuse.mood.action")}
                  </Text>
                </HStack>
              )}
            </FadeOutScaleDown>
          </VStack>
        </KeyboardAwareScrollView>
      )}

      <OptionsBottomSheetModal
        modalRef={moodSheetRef}
        options={moodOptions}
        selectedValue={mood}
        onSelect={handleSelectMood}
        header={t("app.audiomuse.mood.moodLabel")}
        headerDescription={t("app.audiomuse.mood.moodDescription")}
        dismissOnSelect
      />
      <OptionsBottomSheetModal
        modalRef={centroidSheetRef}
        options={centroidOptions}
        selectedValue={centroidIndex}
        onSelect={setCentroidIndex}
        header={t("app.audiomuse.mood.styleLabel")}
        headerDescription={t("app.audiomuse.mood.styleDescription")}
        dismissOnSelect
      />
      <OptionsBottomSheetModal
        modalRef={anchorSheetRef}
        options={anchorOptions}
        selectedValue={anchorId}
        onSelect={setAnchorId}
        header={t("app.audiomuse.mood.anchorLabel")}
        headerDescription={t("app.audiomuse.mood.anchorDescription")}
        dismissOnSelect
      />
    </Box>
  );
}
