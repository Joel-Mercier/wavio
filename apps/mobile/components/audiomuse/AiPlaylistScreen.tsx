import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import Sparkles from "lucide-react-native/dist/esm/icons/sparkles.mjs";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import AudioMuseResults from "@/components/audiomuse/AudioMuseResults";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import {
  AudioMuseChatError,
  generateChatPlaylist,
} from "@/services/audioMuse/chat";
import type { QueueSource } from "@/stores/queue";
import { goBackOrHome } from "@/utils/navigation";

// Keeps the progress panel to the recent past: the pipeline can emit dozens of
// lines and only the tail is meaningful while it runs.
const MAX_LOG_LINES = 40;

export default function AiPlaylistScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // The prompt form and the results list scroll independently, so both have to
  // reserve the same room under them.
  const screenBottomPadding = useScreenBottomPadding();
  const { showErrorToast } = useSettingsToast();
  const [white, primary50] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-primary-50",
  ]) as string[];

  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  // Progress lines repeat and carry no id of their own, so each gets a
  // monotonic one on arrival — the list is append-only and trimmed from the
  // front, which would make positional keys re-map onto different lines.
  const [logLines, setLogLines] = useState<{ id: number; line: string }[]>([]);
  const logIdRef = useRef(0);
  const [itemIds, setItemIds] = useState<string[] | null>(null);
  const [resultPrompt, setResultPrompt] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const source = useMemo<QueueSource>(
    () => ({ type: "audiomuse", name: resultPrompt }),
    [resultPrompt],
  );

  const handleGenerate = async () => {
    const userInput = prompt.trim();
    if (!userInput || isGenerating) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);
    setLogLines([]);
    setItemIds(null);
    try {
      const response = await generateChatPlaylist(userInput, {
        onLog: (line) =>
          setLogLines((lines) =>
            [...lines, { id: logIdRef.current++, line }].slice(-MAX_LOG_LINES),
          ),
        signal: controller.signal,
      });
      const ids = (response.query_results ?? [])
        .map((row) => row.item_id)
        .filter(Boolean);
      setResultPrompt(userInput);
      setItemIds(ids);
    } catch (error) {
      if (!controller.signal.aborted) {
        // AudioMuse explains a refusal in its own words ("No AI provider
        // selected", a missing key, an unusable query); relaying that beats a
        // generic failure the user can't act on.
        showErrorToast(
          error instanceof AudioMuseChatError && error.message
            ? error.message
            : t("app.audiomuse.prompt.failed"),
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
    setLogLines([]);
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
          {t("app.audiomuse.prompt.title")}
        </Heading>
        {/* Balances the back arrow so the title centers on the screen, not on
            the space left over beside it. */}
        <Box className="w-6" />
      </HStack>

      {itemIds ? (
        <VStack className="flex-1">
          <HStack className="items-center justify-between px-6 pb-4 gap-x-4">
            <Text className="text-primary-100 flex-1" numberOfLines={2}>
              {resultPrompt}
            </Text>
            <FadeOutScaleDown
              onPress={handleReset}
              className="items-center justify-center py-2 px-4 border border-primary-400 rounded-full"
            >
              <Text className="text-white text-sm font-bold">
                {t("app.audiomuse.prompt.newPrompt")}
              </Text>
            </FadeOutScaleDown>
          </HStack>
          <AudioMuseResults
            itemIds={itemIds}
            source={source}
            emptyMessage={t("app.audiomuse.prompt.noResults")}
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
              {t("app.audiomuse.prompt.description")}
            </Text>
            <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 rounded-md px-4 py-2">
              <InputField
                value={prompt}
                onChangeText={setPrompt}
                className="text-md text-white"
                placeholder={t("app.audiomuse.prompt.placeholder")}
                placeholderTextColor={primary50}
                multiline
                editable={!isGenerating}
                onSubmitEditing={handleGenerate}
              />
            </Input>
            <FadeOutScaleDown
              onPress={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full self-center"
            >
              {isGenerating ? (
                <Spinner color="rgb(41, 41, 41)" />
              ) : (
                <HStack className="items-center gap-x-2">
                  <Sparkles size={20} color="rgb(41, 41, 41)" />
                  <Text className="text-primary-800 font-bold text-lg">
                    {t("app.audiomuse.prompt.action")}
                  </Text>
                </HStack>
              )}
            </FadeOutScaleDown>

            {logLines.length > 0 && (
              <VStack className="gap-y-1 mt-2 p-4 rounded-md bg-primary-700">
                {logLines.map((entry) => (
                  <Text key={entry.id} className="text-primary-100 text-xs">
                    {entry.line}
                  </Text>
                ))}
              </VStack>
            )}
          </VStack>
        </KeyboardAwareScrollView>
      )}
    </Box>
  );
}
