import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import Check from "lucide-react-native/dist/esm/icons/check.mjs";
import Languages from "lucide-react-native/dist/esm/icons/languages.mjs";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import BottomSheetModalComponent from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { StructuredLyrics } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";

function languageLabel(lang: string, locale?: string | null): string {
  try {
    const dn = new Intl.DisplayNames(locale ? [locale] : undefined, {
      type: "language",
    });
    return dn.of(lang) ?? lang.toUpperCase();
  } catch {
    return lang.toUpperCase();
  }
}

export default function LyricsLayersSheet({
  sheetRef,
  translations,
  pronunciations,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  translations: StructuredLyrics[];
  pronunciations: StructuredLyrics[];
}) {
  const [emerald500, gray200] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-gray-200",
  ]) as string[];
  const { t } = useTranslation();
  const locale = useApp((s) => s.locale);
  const translationLang = useApp((s) => s.lyricsTranslationLang);
  const setTranslationLang = useApp((s) => s.setLyricsTranslationLang);
  const showPronunciation = useApp((s) => s.lyricsShowPronunciation);
  const setShowPronunciation = useApp((s) => s.setLyricsShowPronunciation);

  const langs = translations.map((l) => l.lang);

  return (
    <BottomSheetModalComponent
      ref={sheetRef}
      backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
      handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
    >
      <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
        <Box className="p-6 w-full mb-12">
          <HStack className="items-center mb-6">
            <Languages size={24} color={gray200} />
            <Heading className="ml-4 text-white font-normal" size="lg">
              {t("app.player.lyricsLayers")}
            </Heading>
          </HStack>
          {translations.length > 0 && (
            <VStack className="gap-y-6 mb-8">
              <Text className="text-primary-100 text-sm">
                {t("app.player.translation")}
              </Text>
              <FadeOutScaleDown onPress={() => setTranslationLang(null)}>
                <HStack className="items-center justify-between">
                  <Text
                    className="text-lg"
                    style={{ color: !translationLang ? emerald500 : gray200 }}
                  >
                    {t("app.player.translationOff")}
                  </Text>
                  {!translationLang && <Check size={20} color={emerald500} />}
                </HStack>
              </FadeOutScaleDown>
              {langs.map((lang) => {
                const active = translationLang === lang;
                return (
                  <FadeOutScaleDown
                    key={lang}
                    onPress={() => setTranslationLang(lang)}
                  >
                    <HStack className="items-center justify-between">
                      <Text
                        className="text-lg"
                        style={{ color: active ? emerald500 : gray200 }}
                      >
                        {languageLabel(lang, locale)}
                      </Text>
                      {active && <Check size={20} color={emerald500} />}
                    </HStack>
                  </FadeOutScaleDown>
                );
              })}
            </VStack>
          )}
          {pronunciations.length > 0 && (
            <VStack className="gap-y-6">
              <Text className="text-primary-100 text-sm">
                {t("app.player.pronunciation")}
              </Text>
              <FadeOutScaleDown
                onPress={() => setShowPronunciation(!showPronunciation)}
              >
                <HStack className="items-center justify-between">
                  <Text
                    className="text-lg"
                    style={{ color: showPronunciation ? emerald500 : gray200 }}
                  >
                    {t("app.player.showPronunciation")}
                  </Text>
                  {showPronunciation && <Check size={20} color={emerald500} />}
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          )}
        </Box>
      </BottomSheetScrollView>
    </BottomSheetModalComponent>
  );
}
