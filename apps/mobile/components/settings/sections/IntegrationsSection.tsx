import ChevronRight from "lucide-react-native/dist/esm/icons/chevron-right.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import useMusicBrainz from "@/stores/musicbrainz";
import { cn } from "@/utils/tailwind";

export default function IntegrationsSection() {
  const { t } = useTranslation();
  const [gray200] = Uniwind.getCSSVariable(["--color-gray-200"]) as string[];
  const lastScanAt = useMusicBrainz((store) => store.lastScanAt);
  const hasScanned = lastScanAt !== null;

  return (
    <SettingsScreenScaffold title={t("app.settings.menu.integrations.title")}>
      <VStack className="gap-y-4">
        <Text className="text-primary-100 text-sm py-2">
          {t("app.settings.integrations.description")}
        </Text>
        <FadeOutScaleDown href="/integrations/musicbrainz">
          <HStack className="items-center gap-x-4 py-4">
            <VStack className="gap-y-1 flex-1">
              <Heading className="text-white font-normal" size="md">
                {t("app.settings.integrations.musicbrainz.title")}
              </Heading>
              <Text className="text-primary-100 text-sm">
                {t("app.settings.integrations.musicbrainz.description")}
              </Text>
            </VStack>
            <Badge
              className={cn(
                "rounded-full normal-case py-1 px-3",
                hasScanned ? "bg-emerald-100" : "bg-primary-100",
              )}
              size="lg"
              variant="solid"
              action={hasScanned ? "success" : "muted"}
            >
              <BadgeText
                className={cn(
                  "normal-case text-center",
                  hasScanned ? "text-emerald-700" : "text-primary-700",
                )}
              >
                {hasScanned
                  ? t("app.settings.integrations.statuses.configured")
                  : t("app.settings.integrations.statuses.notConfigured")}
              </BadgeText>
            </Badge>
            <Box className="w-5 items-center">
              <ChevronRight size={20} color={gray200} />
            </Box>
          </HStack>
        </FadeOutScaleDown>
      </VStack>
    </SettingsScreenScaffold>
  );
}
