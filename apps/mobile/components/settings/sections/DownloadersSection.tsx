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
import useLidarr from "@/stores/lidarr";
import useSoulSync from "@/stores/soulsync";
import { cn } from "@/utils/tailwind";

function DownloaderRow({
  title,
  description,
  href,
  isConnected,
}: {
  title: string;
  description: string;
  href: Href;
  isConnected: boolean;
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
            isConnected ? "bg-emerald-100" : "bg-primary-100",
          )}
          size="lg"
          variant="solid"
          action={isConnected ? "success" : "muted"}
        >
          <BadgeText
            className={cn(
              "normal-case text-center",
              isConnected ? "text-emerald-700" : "text-primary-700",
            )}
          >
            {isConnected
              ? t("app.settings.downloaders.statuses.active")
              : t("app.settings.downloaders.statuses.inactive")}
          </BadgeText>
        </Badge>
        <Box className="w-5 items-center">
          <ChevronRight size={20} color={gray200} />
        </Box>
      </HStack>
    </FadeOutScaleDown>
  );
}

export default function DownloadersSection() {
  const { t } = useTranslation();
  const isLidarrConnected = useLidarr((store) => store.isConnected);
  const isSoulSyncConnected = useSoulSync((store) => store.isConnected);

  return (
    <SettingsScreenScaffold title={t("app.settings.menu.downloaders.title")}>
      <VStack className="gap-y-4">
        <Text className="text-primary-100 text-sm py-2">
          {t("app.settings.downloaders.description")}
        </Text>
        <DownloaderRow
          title={t("app.settings.downloaders.lidarr.title")}
          description={t("app.settings.downloaders.lidarr.description")}
          href="/downloaders/lidarr"
          isConnected={isLidarrConnected}
        />
        <DownloaderRow
          title={t("app.settings.downloaders.soulsync.title")}
          description={t("app.settings.downloaders.soulsync.description")}
          href="/downloaders/soulsync"
          isConnected={isSoulSyncConnected}
        />
      </VStack>
    </SettingsScreenScaffold>
  );
}
