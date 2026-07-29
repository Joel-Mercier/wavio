import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import Radar from "lucide-react-native/dist/esm/icons/radar.mjs";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import AudioMuseResults from "@/components/audiomuse/AudioMuseResults";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { SettingsToggleRow } from "@/components/settings/SettingsRows";
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
  clampSimilarResults,
  findSimilarTracks,
  SIMILAR_DEFAULT_RESULTS,
  SIMILAR_MAX_RESULTS,
  SIMILAR_MIN_RESULTS,
} from "@/services/audioMuse/similar";
import type { QueueSource } from "@/stores/queue";
import { goBackOrHome } from "@/utils/navigation";

// Sound-alike search around one track: the config form and, once it has run, the
// same result list every other AudioMuse generator ends in. Reached from the
// track action sheet, so the seed arrives as route params rather than being
// picked here the way AudioMuse's own web UI does it.
export default function SimilarTracksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const { showErrorToast } = useSettingsToast();
  const [white, primary50] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-primary-50",
  ]) as string[];

  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const trackTitle = title ?? "";

  // Held as text so the field can be emptied while typing; the clamp runs on
  // blur and again before the request.
  const [countText, setCountText] = useState(String(SIMILAR_DEFAULT_RESULTS));
  const [limitPerArtist, setLimitPerArtist] = useState(true);
  const [radiusSimilarity, setRadiusSimilarity] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [itemIds, setItemIds] = useState<string[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const heading = t("app.audiomuse.similar.heading", { title: trackTitle });

  const source = useMemo<QueueSource>(
    () => ({ type: "audiomuse", name: heading }),
    [heading],
  );

  const handleCountBlur = () => {
    setCountText(String(clampSimilarResults(Number(countText))));
  };

  const handleGenerate = async () => {
    if (isGenerating || !id) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);
    setItemIds(null);
    try {
      const tracks = await findSimilarTracks({
        itemId: id,
        numResults: Number(countText),
        limitPerArtist,
        radiusSimilarity,
        signal: controller.signal,
      });
      setItemIds(tracks.map((track) => track.item_id));
    } catch (error) {
      if (!controller.signal.aborted) {
        // AudioMuse names the reason it refused ("Invalid server selection.",
        // an index it couldn't load); relaying it beats a generic failure the
        // user can't act on.
        showErrorToast(
          audioMuseErrorMessage(error) ?? t("app.audiomuse.similar.failed"),
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
                {t("app.audiomuse.similar.newSearch")}
              </Text>
            </FadeOutScaleDown>
          </HStack>
          <AudioMuseResults
            itemIds={itemIds}
            source={source}
            emptyMessage={t("app.audiomuse.similar.noResults")}
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
          <VStack className="gap-y-4">
            <Text className="text-primary-100 text-sm">
              {t("app.audiomuse.similar.description")}
            </Text>
            <VStack className="gap-y-2">
              <Heading className="text-white font-normal" size="sm">
                {t("app.audiomuse.similar.countLabel")}
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
                {t("app.audiomuse.similar.countHint", {
                  min: SIMILAR_MIN_RESULTS,
                  max: SIMILAR_MAX_RESULTS,
                })}
              </Text>
            </VStack>
            <SettingsToggleRow
              label={t("app.audiomuse.similar.limitPerArtistLabel")}
              description={t("app.audiomuse.similar.limitPerArtistDescription")}
              value={limitPerArtist}
              onToggle={setLimitPerArtist}
              disabled={isGenerating}
            />
            <SettingsToggleRow
              label={t("app.audiomuse.similar.radiusLabel")}
              description={t("app.audiomuse.similar.radiusDescription")}
              value={radiusSimilarity}
              onToggle={setRadiusSimilarity}
              disabled={isGenerating}
            />
            <FadeOutScaleDown
              onPress={handleGenerate}
              disabled={isGenerating}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full self-center"
            >
              {isGenerating ? (
                <Spinner color="rgb(41, 41, 41)" />
              ) : (
                <HStack className="items-center gap-x-2">
                  <Radar size={20} color="rgb(41, 41, 41)" />
                  <Text className="text-primary-800 font-bold text-lg">
                    {t("app.audiomuse.similar.action")}
                  </Text>
                </HStack>
              )}
            </FadeOutScaleDown>
          </VStack>
        </KeyboardAwareScrollView>
      )}
    </Box>
  );
}
