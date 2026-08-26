import { Redirect } from "expo-router";
import RotateCcw from "lucide-react-native/dist/esm/icons/rotate-ccw.mjs";
import Trash2 from "lucide-react-native/dist/esm/icons/trash-2.mjs";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import { Uniwind } from "uniwind";
import TidarrQueueRow from "@/components/downloaders/tidarr/TidarrQueueRow";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useClearFinished,
  useRetryFailed,
  useTidarrQueue,
} from "@/hooks/tidarr/useTidarrDownloads";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { hasFailedItems, isSettledItem } from "@/services/tidarr/queue";
import useTidarr from "@/stores/tidarr";

export default function TidarrDownloadsScreen() {
  const { t } = useTranslation();
  const isConnected = useTidarr((store) => store.isConnected);
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [emerald500] = Uniwind.getCSSVariable([
    "--color-emerald-500",
  ]) as string[];
  const { data: queue, isLoading } = useTidarrQueue();
  const retry = useRetryFailed();
  const clear = useClearFinished();

  if (!isConnected) {
    return <Redirect href="/downloaders/tidarr" />;
  }

  const items = queue ?? [];
  // Tidarr never drops an item on its own, so finished and failed downloads
  // stay in the queue until they're cleared. Kept in their own section, or
  // "in progress" would keep growing with things that already ended.
  const inProgress = items.filter((item) => !isSettledItem(item));
  const settled = items.filter(isSettledItem);

  // Tidarr has no per-item retry — the endpoint resets every errored item at
  // once, so the action only appears when something has actually failed.
  const handleRetry = () => {
    retry.mutate(undefined, {
      onSuccess: () =>
        showSuccessToast(t("app.settings.downloaders.tidarr.retriedMessage")),
      onError: () =>
        showErrorToast(t("app.settings.downloaders.tidarr.retryFailed")),
    });
  };

  const handleClear = () => {
    clear.mutate(undefined, {
      onSuccess: () =>
        showSuccessToast(t("app.settings.downloaders.tidarr.clearedMessage")),
      onError: () =>
        showErrorToast(t("app.settings.downloaders.tidarr.clearFailed")),
    });
  };

  return (
    <SettingsScreenScaffold
      title={t("app.settings.downloaders.tidarr.downloadsTitle")}
    >
      <VStack className="gap-y-2">
        <Heading className="text-white mt-2" size="md">
          {t("app.settings.downloaders.tidarr.inProgressTitle")}
        </Heading>

        {isLoading && items.length === 0 ? (
          <Box className="py-6 items-center">
            <ActivityIndicator />
          </Box>
        ) : inProgress.length === 0 ? (
          <Text className="text-primary-100 text-sm py-2">
            {t("app.settings.downloaders.tidarr.emptyQueue")}
          </Text>
        ) : (
          inProgress.map((item) => <TidarrQueueRow key={item.id} item={item} />)
        )}

        {settled.length > 0 && (
          <>
            <Box className="h-px bg-primary-500 my-2" />
            <HStack className="items-center justify-between">
              <Heading className="text-white" size="md">
                {t("app.settings.downloaders.tidarr.finishedTitle")}
              </Heading>
              <HStack className="items-center gap-x-5">
                {hasFailedItems(settled) && (
                  <FadeOutScaleDown
                    onPress={handleRetry}
                    disabled={retry.isPending}
                  >
                    <HStack className="items-center gap-x-2">
                      {retry.isPending ? (
                        <Spinner size="small" />
                      ) : (
                        <RotateCcw size={16} color={emerald500} />
                      )}
                      <Text className="text-emerald-400 text-sm">
                        {t("app.settings.downloaders.tidarr.retryFailedAction")}
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
                )}
                <FadeOutScaleDown
                  onPress={handleClear}
                  disabled={clear.isPending}
                >
                  <HStack className="items-center gap-x-2">
                    {clear.isPending ? (
                      <Spinner size="small" />
                    ) : (
                      <Trash2 size={16} color={emerald500} />
                    )}
                    <Text className="text-emerald-400 text-sm">
                      {t("app.settings.downloaders.tidarr.clearFinishedAction")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              </HStack>
            </HStack>
            {settled.map((item) => (
              <TidarrQueueRow key={item.id} item={item} />
            ))}
          </>
        )}
      </VStack>
    </SettingsScreenScaffold>
  );
}
