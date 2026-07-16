import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ConfirmActionDialog from "@/components/settings/ConfirmActionDialog";
import PodcastConfigDialog from "@/components/settings/PodcastConfigDialog";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useRemainingApiRequests } from "@/hooks/taddyPodcasts/useSystem";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import usePodcasts from "@/stores/podcasts";
import { cn } from "@/utils/tailwind";

export default function PodcastsSection() {
  const { t } = useTranslation();
  const { showSuccessToast } = useSettingsToast();
  const [showPodcastsAlertDialog, setShowPodcastsAlertDialog] = useState(false);
  const [showDeletePodcastsAlertDialog, setShowDeletePodcastsAlertDialog] =
    useState(false);
  const clearTaddyPodcastsConfig = usePodcasts(
    (store) => store.clearTaddyPodcastsConfig,
  );
  const taddyPodcastApiKey = usePodcasts((store) => store.taddyPodcastsApiKey);
  const taddyPodcastUserId = usePodcasts((store) => store.taddyPodcastsUserId);
  const { data: remainingApiRequests } = useRemainingApiRequests(
    !!(taddyPodcastApiKey && taddyPodcastUserId),
  );

  const handleDeletePodcastsConfigPress = () => {
    clearTaddyPodcastsConfig();
    setShowDeletePodcastsAlertDialog(false);
    showSuccessToast(
      t("app.settings.podcastSettings.removePodcastConfigSuccessMessage"),
    );
  };

  return (
    <SettingsScreenScaffold
      title={t("app.settings.menu.podcasts.title")}
      overlays={
        <>
          <PodcastConfigDialog
            isOpen={showPodcastsAlertDialog}
            onClose={() => setShowPodcastsAlertDialog(false)}
          />
          <ConfirmActionDialog
            isOpen={showDeletePodcastsAlertDialog}
            onClose={() => setShowDeletePodcastsAlertDialog(false)}
            title={t(
              "app.settings.podcastSettings.removePodcastConfigConfirmLabel",
            )}
            description={t(
              "app.settings.podcastSettings.removePodcastConfigConfirmDescription",
            )}
            cancelLabel={t("app.shared.cancel")}
            confirmLabel={t("app.shared.delete")}
            onConfirm={handleDeletePodcastsConfigPress}
          />
        </>
      }
    >
      <VStack className="gap-y-4">
        <VStack className="gap-y-2 py-4">
          <Heading className="text-white font-normal" size="md">
            {t("app.settings.podcastSettings.getApiKeyLabel")}
          </Heading>
          <Text className="text-primary-100 text-sm">
            {t("app.settings.podcastSettings.getApiKeyDescription")}
          </Text>
          <Text
            className="text-emerald-400 text-sm underline"
            onPress={() =>
              Linking.openURL("https://taddy.org/developers/podcast-api")
            }
          >
            {t("app.settings.podcastSettings.getApiKeyAction")}
          </Text>
        </VStack>
        <HStack className="items-center gap-x-4 py-4 justify-between">
          <VStack className="gap-y-2 w-1/2">
            <Heading className="text-white font-normal" size="md">
              {t("app.settings.podcastSettings.configurePodcastsLabel")}
            </Heading>
            <Text className="text-primary-100 text-sm">
              {t("app.settings.podcastSettings.configurePodcastsDescription")}
            </Text>
          </VStack>
          <VStack className="gap-y-4">
            <FadeOutScaleDown
              onPress={() => setShowPodcastsAlertDialog(true)}
              className="items-center justify-center py-2 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.settings.podcastSettings.configurePodcastsAction")}
              </Text>
            </FadeOutScaleDown>
            {taddyPodcastApiKey && taddyPodcastUserId && (
              <FadeOutScaleDown
                onPress={() => setShowDeletePodcastsAlertDialog(true)}
                className="flex-1 items-center justify-center py-2 px-8 border border-red-500 bg-red-500 rounded-full"
              >
                <Text
                  numberOfLines={1}
                  className="text-primary-800 font-bold text-lg"
                >
                  {t("app.shared.delete")}
                </Text>
              </FadeOutScaleDown>
            )}
          </VStack>
        </HStack>
        <HStack className="items-center gap-x-4 py-4 justify-between">
          <VStack className="gap-y-2 w-3/5">
            <Heading className="text-white font-normal" size="md">
              {t("app.settings.podcastSettings.apiStatusLabel")}
            </Heading>
            <Text className="text-primary-100 text-sm">
              {t("app.settings.podcastSettings.apiStatusDescription")}
            </Text>
            {taddyPodcastUserId && (
              <Text className="text-primary-100 text-sm">
                {`${t("app.settings.podcastSettings.userId")}: ${taddyPodcastUserId}`}
              </Text>
            )}
            {taddyPodcastApiKey && (
              <Text className="text-primary-100 text-sm">
                {`${t("app.settings.podcastSettings.apiKey")}: ${taddyPodcastApiKey.slice(0, 4)}${"•".repeat(Math.max(0, taddyPodcastApiKey.length - 4))}`}
              </Text>
            )}
            {remainingApiRequests?.data?.getApiRequestsRemaining && (
              <Text className="text-emerald-400 text-sm">
                {t("app.settings.podcastSettings.remainingApiRequests", {
                  count: remainingApiRequests.data.getApiRequestsRemaining,
                  total: 500,
                })}
              </Text>
            )}
          </VStack>
          <Badge
            className={cn("rounded-full normal-case py-1 px-3 bg-primary-100", {
              "bg-emerald-100": taddyPodcastApiKey && taddyPodcastUserId,
            })}
            size="lg"
            variant="solid"
            action={
              taddyPodcastApiKey && taddyPodcastUserId ? "warning" : "success"
            }
          >
            <BadgeText
              className={cn("normal-case text-center text-primary-700", {
                "text-emerald-700": taddyPodcastApiKey && taddyPodcastUserId,
              })}
            >
              {taddyPodcastApiKey && taddyPodcastUserId
                ? t("app.settings.podcastSettings.statuses.active")
                : t("app.settings.podcastSettings.statuses.inactive")}
            </BadgeText>
          </Badge>
        </HStack>
      </VStack>
    </SettingsScreenScaffold>
  );
}
