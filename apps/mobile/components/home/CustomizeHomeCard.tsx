import type { Href } from "expo-router";
import ChevronRight from "lucide-react-native/dist/esm/icons/chevron-right.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";

// Each home tab points at the setting that shapes that tab's own feed, and
// names the row it wants scrolled into view (see useHighlightedSetting).
const TARGETS = {
  music: { section: "appearance", highlight: "homeSections" },
  podcasts: { section: "podcasts", highlight: "recommendations" },
  radio: { section: "radio", highlight: "feedTags" },
} as const;

type CustomizeTarget = keyof typeof TARGETS;

/**
 * Footer card of a home tab's feed: a shortcut to the setting that customizes
 * it, and a hint that the feed can be customized at all.
 */
export default function CustomizeHomeCard({
  target,
}: {
  target: CustomizeTarget;
}) {
  const { t } = useTranslation();
  const [gray200] = Uniwind.getCSSVariable(["--color-gray-200"]) as string[];
  const { section, highlight } = TARGETS[target];

  return (
    <Box className="px-6 mt-4 mb-6">
      <FadeOutScaleDown
        href={
          {
            pathname: "/settings/[section]",
            params: { section, highlight },
          } as Href
        }
        className="border border-primary-500 rounded-xl px-4 py-5"
      >
        <HStack className="items-center gap-x-4">
          <VStack className="gap-y-1 flex-1">
            <Heading className="text-white" size="md">
              {t(`app.home.customize.${target}.title`)}
            </Heading>
            <Text className="text-primary-100 text-sm">
              {t(`app.home.customize.${target}.description`)}
            </Text>
          </VStack>
          <ChevronRight size={20} color={gray200} />
        </HStack>
      </FadeOutScaleDown>
    </Box>
  );
}
