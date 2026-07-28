import type { Href } from "expo-router";
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
import { useCapabilities } from "@/hooks/useCapabilities";
import useAudioMuse from "@/stores/audioMuse";
import { useAuthBase } from "@/stores/auth";
import useMusicBrainz from "@/stores/musicbrainz";
import { cn } from "@/utils/tailwind";

function IntegrationRow({
  title,
  description,
  href,
  isConfigured,
}: {
  title: string;
  description: string;
  href: Href;
  isConfigured: boolean;
}) {
  const { t } = useTranslation();
  const [gray200] = Uniwind.getCSSVariable(["--color-gray-200"]) as string[];

  return (
    <FadeOutScaleDown href={href}>
      <HStack className="items-center gap-x-4 py-4">
        <VStack className="gap-y-1 flex-1">
          <Heading className="text-white font-normal" size="md">
            {title}
          </Heading>
          <Text className="text-primary-100 text-sm">{description}</Text>
        </VStack>
        <Badge
          className={cn(
            "rounded-full normal-case py-1 px-3",
            isConfigured ? "bg-emerald-100" : "bg-primary-100",
          )}
          size="lg"
          variant="solid"
          action={isConfigured ? "success" : "muted"}
        >
          <BadgeText
            className={cn(
              "normal-case text-center",
              isConfigured ? "text-emerald-700" : "text-primary-700",
            )}
          >
            {isConfigured
              ? t("app.settings.integrations.statuses.configured")
              : t("app.settings.integrations.statuses.notConfigured")}
          </BadgeText>
        </Badge>
        <Box className="w-5 items-center">
          <ChevronRight size={20} color={gray200} />
        </Box>
      </HStack>
    </FadeOutScaleDown>
  );
}

export default function IntegrationsSection() {
  const { t } = useTranslation();
  const capabilities = useCapabilities();
  // AudioMuse-AI analyses a media server's library and answers in that server's
  // item ids, so it has nothing to say about an on-device library.
  const isLocal = useAuthBase((store) => store.serverType === "local");
  const lastScanAt = useMusicBrainz((store) => store.lastScanAt);
  const isAudioMuseConnected = useAudioMuse((store) => store.isConnected);

  return (
    <SettingsScreenScaffold title={t("app.settings.menu.integrations.title")}>
      <VStack className="gap-y-4">
        <Text className="text-primary-100 text-sm py-2">
          {t("app.settings.integrations.description")}
        </Text>
        {capabilities.tagWriting && (
          <IntegrationRow
            title={t("app.settings.integrations.musicbrainz.title")}
            description={t("app.settings.integrations.musicbrainz.description")}
            href="/integrations/musicbrainz"
            isConfigured={lastScanAt !== null}
          />
        )}
        {!isLocal && (
          <IntegrationRow
            title={t("app.settings.integrations.audiomuse.title")}
            description={t("app.settings.integrations.audiomuse.description")}
            href="/integrations/audiomuse"
            isConfigured={isAudioMuseConnected}
          />
        )}
      </VStack>
    </SettingsScreenScaffold>
  );
}
