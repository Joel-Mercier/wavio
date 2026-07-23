import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { type Href, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import OptionsBottomSheetModal from "@/components/settings/OptionsBottomSheetModal";
import {
  SettingsActionRow,
  SettingsSelectRow,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Progress, ProgressFilledTrack } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useStarred2 } from "@/hooks/backend/useLists";
import {
  useDownloadedTracksCount,
  useDownloadedTracksList,
  useLibrarySyncStatus,
  useOfflineDownloads,
  useTotalDownloadSize,
} from "@/hooks/offline";
import { useCapabilities } from "@/hooks/useCapabilities";
import { librarySyncService } from "@/services/offline";
import useApp, { type StreamFormat } from "@/stores/app";
import useLibrarySync from "@/stores/librarySync";
import useOfflineMutations from "@/stores/offlineMutations";
import { niceBytes } from "@/utils/fileSize";

const downloadBitRateOptions: (number | null)[] = [
  null,
  64,
  96,
  128,
  192,
  256,
  320,
];

const downloadFormatOptions: StreamFormat[] = [
  "raw",
  "flac",
  "opus",
  "mp3",
  "aac",
];

const pausedStatusKeys = {
  pausedOffline: "app.settings.offlineSettings.extendedOfflinePausedOffline",
  pausedWifi: "app.settings.offlineSettings.extendedOfflinePausedWifi",
  pausedDisk: "app.settings.offlineSettings.extendedOfflinePausedDisk",
  syncError: "app.settings.offlineSettings.extendedOfflineSyncError",
  unsupported: "app.settings.offlineSettings.extendedOfflineUnsupported",
} as const;

function LibrarySyncStatusLine() {
  const { t } = useTranslation();
  const {
    status,
    downloadedCount,
    total,
    size,
    progress,
    artworkDone,
    artworkTotal,
    artworkPending,
  } = useLibrarySyncStatus();
  if (status === "off") return null;
  const statusText =
    status === "syncing"
      ? t("app.settings.offlineSettings.extendedOfflineSyncing", {
          count: downloadedCount,
          total,
          size: niceBytes(size),
        })
      : status === "cachingArtwork"
        ? t("app.settings.offlineSettings.extendedOfflineCachingArtwork", {
            count: artworkDone,
            total: artworkTotal,
          })
        : status === "upToDate"
          ? t("app.settings.offlineSettings.extendedOfflineComplete", {
              count: downloadedCount,
              size: niceBytes(size),
            })
          : t(pausedStatusKeys[status]);
  return (
    <VStack className="gap-y-2">
      <Text
        className={
          status === "syncing" ||
          status === "cachingArtwork" ||
          status === "upToDate"
            ? "text-emerald-400 text-sm"
            : "text-orange-400 text-sm"
        }
      >
        {statusText}
      </Text>
      {/* Covers usually finish well before the tracks do, so the artwork-only
          status never gets a turn on a small library. Report it alongside the
          track count instead of leaving it invisible. */}
      {artworkPending > 0 && status !== "cachingArtwork" && (
        <Text className="text-emerald-400 text-sm">
          {t("app.settings.offlineSettings.extendedOfflineCachingArtwork", {
            count: artworkDone,
            total: artworkTotal,
          })}
        </Text>
      )}
      {(status === "syncing" ||
        status === "cachingArtwork" ||
        status === "pausedOffline" ||
        status === "pausedWifi" ||
        status === "pausedDisk" ||
        status === "syncError") && (
        <Box className="h-1.5 rounded-full bg-primary-400 overflow-hidden">
          <Box
            className="h-full rounded-full bg-emerald-500"
            style={{
              width: `${Math.round(
                (status === "cachingArtwork" && artworkTotal > 0
                  ? artworkDone / artworkTotal
                  : progress) * 100,
              )}%`,
            }}
          />
        </Box>
      )}
    </VStack>
  );
}

export default function DownloadsOfflineSection() {
  const [primary800] = Uniwind.getCSSVariable([
    "--color-primary-800",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const capabilities = useCapabilities();
  const downloadsWifiOnly = useApp((store) => store.downloadsWifiOnly);
  const setDownloadsWifiOnly = useApp((store) => store.setDownloadsWifiOnly);
  const autoSignOutOnServerUnreachable = useApp(
    (store) => store.autoSignOutOnServerUnreachable,
  );
  const setAutoSignOutOnServerUnreachable = useApp(
    (store) => store.setAutoSignOutOnServerUnreachable,
  );
  const downloadFormat = useApp((store) => store.downloadFormat);
  const setDownloadFormat = useApp((store) => store.setDownloadFormat);
  const downloadMaxBitRate = useApp((store) => store.downloadMaxBitRate);
  const setDownloadMaxBitRate = useApp((store) => store.setDownloadMaxBitRate);
  const { offlineModeEnabled, setOfflineModeEnabled } = useOfflineDownloads();
  // Use the plain selector form (not `.use.queue()`): the React Compiler only
  // recognizes a call as a hook by its `use*` call-site name, so the member
  // form gets memoized as a normal call and skips the underlying store hook on
  // some renders — shifting every hook after it and breaking the hook order.
  const pendingChangesCount = useOfflineMutations((s) => s.queue).length;
  const extendedOfflineModeEnabled = useLibrarySync(
    (s) => s.extendedOfflineModeEnabled,
  );
  const setExtendedOfflineModeEnabled = useLibrarySync(
    (s) => s.setExtendedOfflineModeEnabled,
  );
  const downloadedTracksCount = useDownloadedTracksCount();
  const totalDownloadSize = useTotalDownloadSize();
  const downloadedTracksList = useDownloadedTracksList();
  const { data: starredTracksData } = useStarred2({});
  const totalTracksToDownload = starredTracksData?.starred2?.song?.length ?? 0;

  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableProgress, setDisableProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const bottomSheetDownloadFormatModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetDownloadBitRateModalRef = useRef<BottomSheetModal>(null);

  const handleExtendedOfflineToggle = (value: boolean) => {
    if (value) {
      // The root LibrarySyncController reacts to the flag and starts the crawl.
      setExtendedOfflineModeEnabled(true);
    } else {
      setShowDisableConfirm(true);
    }
  };

  const handleDisableConfirmPress = async () => {
    setIsDisabling(true);
    setDisableProgress({ done: 0, total: 0 });
    try {
      await librarySyncService.disable((done, total) =>
        setDisableProgress({ done, total }),
      );
    } finally {
      setIsDisabling(false);
      setDisableProgress(null);
      setShowDisableConfirm(false);
    }
  };

  const formatBitRate = (value: number | null) =>
    value === null
      ? t("app.settings.streamingSettings.audioQualityOriginal")
      : t("app.settings.streamingSettings.audioQualityKbps", {
          bitrate: value,
        });

  return (
    <SettingsScreenScaffold
      title={t("app.settings.menu.downloads.title")}
      overlays={
        <>
          <OptionsBottomSheetModal
            modalRef={bottomSheetDownloadFormatModalRef}
            header={t("app.settings.offlineSettings.downloadFormatLabel")}
            headerDescription={t(
              "app.settings.offlineSettings.downloadFormatDescription",
            )}
            options={downloadFormatOptions.map((option) => ({
              value: option,
              label: t(
                `app.settings.streamingSettings.streamingFormatOptions.${option}`,
              ),
            }))}
            selectedValue={downloadFormat}
            onSelect={setDownloadFormat}
            dismissOnSelect
          />
          <OptionsBottomSheetModal
            modalRef={bottomSheetDownloadBitRateModalRef}
            header={t("app.settings.offlineSettings.downloadBitRateLabel")}
            headerDescription={t(
              "app.settings.offlineSettings.downloadBitRateDescription",
            )}
            options={downloadBitRateOptions.map((option) => ({
              value: option,
              label: formatBitRate(option),
            }))}
            selectedValue={downloadMaxBitRate}
            onSelect={setDownloadMaxBitRate}
          />
        </>
      }
    >
      <VStack className="gap-y-4">
        <SettingsToggleRow
          label={t("app.settings.offlineSettings.offlineModeLabel")}
          description={t("app.settings.offlineSettings.offlineModeDescription")}
          value={offlineModeEnabled}
          onToggle={(value) => setOfflineModeEnabled(value)}
        >
          {offlineModeEnabled && (
            <Text className="text-emerald-400 text-sm">
              {t("app.settings.offlineSettings.downloadedTracksCount", {
                count: downloadedTracksCount,
                total: Math.max(
                  totalTracksToDownload,
                  downloadedTracksList.length,
                ),
                size: niceBytes(totalDownloadSize),
              })}
            </Text>
          )}
        </SettingsToggleRow>
        {capabilities.offlineDownload && (
          <SettingsToggleRow
            label={t("app.settings.offlineSettings.extendedOfflineLabel")}
            description={t(
              "app.settings.offlineSettings.extendedOfflineDescription",
            )}
            value={extendedOfflineModeEnabled}
            onToggle={handleExtendedOfflineToggle}
          >
            <LibrarySyncStatusLine />
          </SettingsToggleRow>
        )}
        <SettingsToggleRow
          label={t("app.settings.offlineSettings.downloadsWifiOnlyLabel")}
          description={t(
            "app.settings.offlineSettings.downloadsWifiOnlyDescription",
          )}
          value={downloadsWifiOnly}
          onToggle={(value) => setDownloadsWifiOnly(value)}
        />
        {capabilities.streamFormatSelection && (
          <SettingsSelectRow
            label={t("app.settings.offlineSettings.downloadFormatLabel")}
            description={t(
              "app.settings.offlineSettings.downloadFormatDescription",
            )}
            badgeText={t(
              `app.settings.streamingSettings.streamingFormatOptions.${downloadFormat}`,
            )}
            onPress={() => bottomSheetDownloadFormatModalRef.current?.present()}
          />
        )}
        {capabilities.streamFormatSelection && downloadFormat !== "raw" && (
          <SettingsSelectRow
            label={t("app.settings.offlineSettings.downloadBitRateLabel")}
            description={t(
              "app.settings.offlineSettings.downloadBitRateDescription",
            )}
            badgeText={formatBitRate(downloadMaxBitRate)}
            onPress={() =>
              bottomSheetDownloadBitRateModalRef.current?.present()
            }
          />
        )}
        <SettingsToggleRow
          label={t("app.settings.offlineSettings.autoSignOutLabel")}
          description={t("app.settings.offlineSettings.autoSignOutDescription")}
          value={autoSignOutOnServerUnreachable}
          onToggle={(value) => setAutoSignOutOnServerUnreachable(value)}
        />
        <SettingsActionRow
          label={t("app.settings.offlineSettings.manageDownloadsLabel")}
          description={t(
            "app.settings.offlineSettings.manageDownloadsDescription",
          )}
          actionLabel={t("app.settings.offlineSettings.manageDownloadsAction")}
          onPress={() => router.navigate("/offline-downloads")}
          disabled={
            (!offlineModeEnabled && !extendedOfflineModeEnabled) ||
            downloadedTracksList.length === 0
          }
        />
        {pendingChangesCount > 0 && (
          <SettingsActionRow
            label={t("app.settings.offlineSettings.pendingChangesLabel")}
            description={t(
              "app.settings.offlineSettings.pendingChangesDescription",
              { count: pendingChangesCount },
            )}
            actionLabel={t("app.settings.offlineSettings.pendingChangesAction")}
            onPress={() => router.navigate("/pending-changes" as Href)}
          />
        )}
      </VStack>
      <AlertDialog
        isOpen={showDisableConfirm}
        onClose={() => {
          if (isDisabling) return;
          setShowDisableConfirm(false);
        }}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t(
                "app.settings.offlineSettings.extendedOfflineDisableConfirmTitle",
              )}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t(
                "app.settings.offlineSettings.extendedOfflineDisableConfirmDescription",
              )}
            </Text>
          </AlertDialogBody>
          <VStack className="gap-y-4">
            {isDisabling && (
              <VStack className="gap-y-2">
                <Text className="text-primary-100 text-sm text-center">
                  {t("app.settings.offlineSettings.extendedOfflineDeleting", {
                    done: disableProgress?.done ?? 0,
                    total: disableProgress?.total ?? 0,
                  })}
                </Text>
                <Progress
                  value={
                    disableProgress && disableProgress.total > 0
                      ? Math.round(
                          (disableProgress.done / disableProgress.total) * 100,
                        )
                      : 0
                  }
                  className="bg-primary-600"
                >
                  <ProgressFilledTrack className="bg-emerald-500" />
                </Progress>
              </VStack>
            )}
            <AlertDialogFooter className="items-center justify-center">
              <FadeOutScaleDown
                onPress={
                  isDisabling ? undefined : () => setShowDisableConfirm(false)
                }
                className={`items-center justify-center py-3 px-8 border border-white rounded-full mr-4${
                  isDisabling ? " opacity-50" : ""
                }`}
              >
                <Text className="text-white font-bold text-lg">
                  {t("app.shared.cancel")}
                </Text>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={isDisabling ? undefined : handleDisableConfirmPress}
                className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
              >
                {isDisabling ? (
                  <Spinner color={primary800} />
                ) : (
                  <Text className="text-primary-800 font-bold text-lg">
                    {t("app.shared.delete")}
                  </Text>
                )}
              </FadeOutScaleDown>
            </AlertDialogFooter>
          </VStack>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsScreenScaffold>
  );
}
