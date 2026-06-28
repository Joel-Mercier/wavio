import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useQueryClient } from "@tanstack/react-query";
import { parseISO } from "date-fns/parseISO";
import * as Application from "expo-application";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type LayoutChangeEvent, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import * as z from "zod";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import RadioFeedTagsSheet from "@/components/internetRadioStations/RadioFeedTagsSheet";
import SearchableSelectSheet from "@/components/internetRadioStations/SearchableSelectSheet";
import ConfirmActionDialog from "@/components/settings/ConfirmActionDialog";
import OptionsBottomSheetModal from "@/components/settings/OptionsBottomSheetModal";
import PodcastConfigDialog from "@/components/settings/PodcastConfigDialog";
import {
  SettingsActionRow,
  SettingsSectionTitle,
  SettingsSelectRow,
  SettingsStepperRow,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import StorageOverview from "@/components/settings/StorageOverview";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Divider } from "@/components/ui/divider";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { SupportedLanguages } from "@/config/i18n";
import { queryPersister } from "@/config/queryClient";
import { useStarred2 } from "@/hooks/backend/useLists";
import {
  useGetScanStatus,
  useStartScan,
} from "@/hooks/backend/useMediaLibraryScanning";
import {
  useDownloadedTracksCount,
  useDownloadedTracksList,
  useOfflineDownloads,
  useTotalDownloadSize,
} from "@/hooks/offline";
import { useRadioCountries } from "@/hooks/radioBrowser/useRadioBrowser";
import { useRemainingApiRequests } from "@/hooks/taddyPodcasts/useSystem";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useFloatingPlayerInset } from "@/hooks/useFloatingPlayerInset";
import { exportBackup, pickBackupFile, restoreBackup } from "@/services/backup";
import {
  isEqualizerAvailable,
  openSystemEqualizer,
} from "@/services/equalizer";
import useActivity from "@/stores/activity";
import useApp, { type StreamFormat } from "@/stores/app";
import { useAuthBase } from "@/stores/auth";
import useLocalLibrary from "@/stores/localLibrary";
import usePodcasts from "@/stores/podcasts";
import useRecentPlays from "@/stores/recentPlays";
import useRecentSearches from "@/stores/recentSearches";
import { formatDistanceToNow } from "@/utils/date";
import { niceBytes } from "@/utils/fileSize";
import { logError } from "@/utils/log";
import { goBackOrHome } from "@/utils/navigation";
import { switchToServer } from "@/utils/switchServer";
import { cn } from "@/utils/tailwind";

export default function SettingsDetail() {
  const { t } = useTranslation();
  const [showRecentPlaysAlertDialog, setShowRecentPlaysAlertDialog] =
    useState(false);
  const [showRecentSearchesAlertDialog, setShowRecentSearchesAlertDialog] =
    useState(false);
  const [showPodcastsAlertDialog, setShowPodcastsAlertDialog] = useState(false);
  const [showActivityAlertDialog, setShowActivityAlertDialog] = useState(false);
  const [showDeletePodcastsAlertDialog, setShowDeletePodcastsAlertDialog] =
    useState(false);
  const [showRestoreConfirmAlertDialog, setShowRestoreConfirmAlertDialog] =
    useState(false);
  const [showRestartRequiredAlertDialog, setShowRestartRequiredAlertDialog] =
    useState(false);
  const [showClearCacheAlertDialog, setShowClearCacheAlertDialog] =
    useState(false);
  const [storageRefreshToken, setStorageRefreshToken] = useState(0);
  const [restoreTarget, setRestoreTarget] = useState<{
    serverId: string | null;
    username: string | null;
  } | null>(null);
  const bottomSheetLanguageModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } = useBottomSheetBackHandler(
    bottomSheetLanguageModalRef,
  );
  const bottomSheetBitRateModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange: handleBitRateSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetBitRateModalRef);
  const bottomSheetCellularBitRateModalRef = useRef<BottomSheetModal>(null);
  const {
    handleSheetPositionChange: handleCellularBitRateSheetPositionChange,
  } = useBottomSheetBackHandler(bottomSheetCellularBitRateModalRef);
  const bottomSheetStreamingFormatModalRef = useRef<BottomSheetModal>(null);
  const {
    handleSheetPositionChange: handleStreamingFormatSheetPositionChange,
  } = useBottomSheetBackHandler(bottomSheetStreamingFormatModalRef);
  const bottomSheetReplayGainModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange: handleReplayGainSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetReplayGainModalRef);
  const bottomSheetQueueSyncModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange: handleQueueSyncSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetQueueSyncModalRef);
  const bottomSheetRadioCountryModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange: handleRadioCountrySheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetRadioCountryModalRef);
  const bottomSheetRadioTagsModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange: handleRadioTagsSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetRadioTagsModalRef);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const floatingPlayerInset = useFloatingPlayerInset();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const hasScrolledToSection = useRef(false);
  const toast = useToast();
  const capabilities = useCapabilities();
  // The on-device library reads straight off the filesystem: offline downloads
  // and stream-bitrate settings don't apply, so those rows are hidden for it.
  const isLocal = useAuthBase((store) => store.serverType === "local");
  const locale = useApp((store) => store.locale);
  const setLocale = useApp((store) => store.setLocale);
  const showAddTab = useApp((store) => store.showAddTab);
  const setShowAddTab = useApp((store) => store.setShowAddTab);
  const showEmptyHomeSections = useApp((store) => store.showEmptyHomeSections);
  const setShowEmptyHomeSections = useApp(
    (store) => store.setShowEmptyHomeSections,
  );
  const maxBitRate = useApp((store) => store.maxBitRate);
  const setMaxBitRate = useApp((store) => store.setMaxBitRate);
  const cellularMaxBitRate = useApp((store) => store.cellularMaxBitRate);
  const setCellularMaxBitRate = useApp((store) => store.setCellularMaxBitRate);
  const streamingFormat = useApp((store) => store.streamingFormat);
  const setStreamingFormat = useApp((store) => store.setStreamingFormat);
  const downloadsWifiOnly = useApp((store) => store.downloadsWifiOnly);
  const setDownloadsWifiOnly = useApp((store) => store.setDownloadsWifiOnly);
  const replayGainMode = useApp((store) => store.replayGainMode);
  const setReplayGainMode = useApp((store) => store.setReplayGainMode);
  const replayGainPreampDb = useApp((store) => store.replayGainPreampDb);
  const setReplayGainPreampDb = useApp((store) => store.setReplayGainPreampDb);
  const crossfadeSeconds = useApp((store) => store.crossfadeSeconds);
  const setCrossfadeSeconds = useApp((store) => store.setCrossfadeSeconds);
  const gaplessEnabled = useApp((store) => store.gaplessEnabled);
  const setGaplessEnabled = useApp((store) => store.setGaplessEnabled);
  const endlessPlaybackEnabled = useApp(
    (store) => store.endlessPlaybackEnabled,
  );
  const setEndlessPlaybackEnabled = useApp(
    (store) => store.setEndlessPlaybackEnabled,
  );
  const queueSyncPriority = useApp((store) => store.queueSyncPriority);
  const setQueueSyncPriority = useApp((store) => store.setQueueSyncPriority);
  const internetRadioCountryCode = useApp(
    (store) => store.internetRadioCountryCode,
  );
  const setInternetRadioCountryCode = useApp(
    (store) => store.setInternetRadioCountryCode,
  );
  const internetRadioFeedTags = useApp((store) => store.internetRadioFeedTags);
  const clearTaddyPodcastsConfig = usePodcasts(
    (store) => store.clearTaddyPodcastsConfig,
  );
  const taddyPodcastApiKey = usePodcasts((store) => store.taddyPodcastsApiKey);
  const taddyPodcastUserId = usePodcasts((store) => store.taddyPodcastsUserId);
  const clearRecentPlays = useRecentPlays((store) => store.clearRecentPlays);
  const clearRecentSearches = useRecentSearches(
    (store) => store.clearRecentSearches,
  );
  const clearActivity = useActivity((store) => store.clearActivity);
  const doStartScan = useStartScan();
  const { data } = useGetScanStatus();
  const { data: remainingApiRequests } = useRemainingApiRequests(
    !!(taddyPodcastApiKey && taddyPodcastUserId),
  );

  const { offlineModeEnabled, setOfflineModeEnabled } = useOfflineDownloads();
  const downloadedTracksCount = useDownloadedTracksCount();
  const totalDownloadSize = useTotalDownloadSize();
  const downloadedTracksList = useDownloadedTracksList();
  const { data: starredTracksData } = useStarred2({});
  const totalTracksToDownload = starredTracksData?.starred2?.song?.length ?? 0;

  const [emerald500] = Uniwind.getCSSVariable([
    "--color-emerald-500",
  ]) as string[];
  const { data: radioCountriesData } = useRadioCountries();
  const radioCountryOptions = useMemo(
    () =>
      (radioCountriesData ?? [])
        .filter((c) => c.iso_3166_1 && c.name)
        .map((c) => ({ label: c.name, value: c.iso_3166_1 })),
    [radioCountriesData],
  );
  const radioCountryBadgeText = useMemo(() => {
    if (!internetRadioCountryCode) {
      return t("app.settings.internetRadioStationsSettings.countryAutomatic");
    }
    return (
      radioCountryOptions.find((o) => o.value === internetRadioCountryCode)
        ?.label ?? internetRadioCountryCode
    );
  }, [internetRadioCountryCode, radioCountryOptions, t]);

  const showSuccessToast = (description: string) => {
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>{description}</ToastDescription>
        </Toast>
      ),
    });
  };

  const showErrorToast = (description: string) => {
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="error">
          <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
          <ToastDescription>{description}</ToastDescription>
        </Toast>
      ),
    });
  };

  const replayGainOptions: ("off" | "track" | "album")[] = [
    "off",
    "track",
    "album",
  ];

  const queueSyncOptions: ("server" | "local" | "off")[] = [
    "server",
    "local",
    "off",
  ];

  const adjustPreamp = (delta: number) => {
    const next = Math.min(15, Math.max(-15, replayGainPreampDb + delta));
    setReplayGainPreampDb(next);
  };

  const adjustCrossfade = (delta: number) => {
    setCrossfadeSeconds(crossfadeSeconds + delta);
  };

  const handleOpenEqualizerPress = async () => {
    try {
      await openSystemEqualizer(Application.applicationId ?? "");
    } catch {
      showErrorToast(t("app.settings.playbackSettings.equalizerErrorMessage"));
    }
  };

  const bitRateOptions: (number | null)[] = [null, 64, 96, 128, 192, 256, 320];

  const streamingFormatOptions: StreamFormat[] = [
    "raw",
    "flac",
    "opus",
    "mp3",
    "aac",
  ];

  const formatBitRate = (value: number | null) =>
    value === null
      ? t("app.settings.streamingSettings.audioQualityOriginal")
      : t("app.settings.streamingSettings.audioQualityKbps", {
          bitrate: value,
        });

  const handleClearCachePress = () => {
    // Clears only the active server's query cache (in-memory + persisted blob).
    // Downloaded files are untouched.
    queryClient.clear();
    void queryPersister.removeClient();
    setShowClearCacheAlertDialog(false);
    setStorageRefreshToken((value) => value + 1);
    showSuccessToast(t("app.settings.cacheSettings.successMessage"));
  };

  const handleDeleteRecentPlaysPress = () => {
    clearRecentPlays();
    setShowRecentPlaysAlertDialog(false);
    showSuccessToast(
      t("app.settings.contentSettings.recentPlaysSuccessMessage"),
    );
  };

  const handleDeleteRecentSearchesPress = () => {
    clearRecentSearches();
    setShowRecentSearchesAlertDialog(false);
    showSuccessToast(
      t("app.settings.contentSettings.recentSearchesSuccessMessage"),
    );
  };

  const handleDeleteActivityPress = () => {
    clearActivity();
    setShowActivityAlertDialog(false);
    showSuccessToast(t("app.settings.contentSettings.activitySuccessMessage"));
  };

  const handleMediaLibraryScanPress = () => {
    // Local mode: re-open the full-screen indexing gate, which runs a forced
    // full re-extraction (with live progress) rather than the background
    // incremental scan — so new tag fields land on already-indexed files.
    if (isLocal) {
      useLocalLibrary.getState().requestRescan();
      return;
    }
    doStartScan.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries();
        showSuccessToast(
          t(
            "app.settings.musicLibrarySettings.scanMusicLibrarySuccessDescription",
          ),
        );
      },
      onError: (error) => {
        logError(error);
        showErrorToast(
          t(
            "app.settings.musicLibrarySettings.scanMusicLibraryErrorDescription",
          ),
        );
      },
    });
  };

  // When navigated here with `?section=podcasts` (e.g. from the podcasts
  // screens' "configure" CTA), auto-scroll to the podcast section once it has
  // been laid out. The y from onLayout is relative to the ScrollView content,
  // so it maps directly to a scroll offset.
  const handlePodcastSectionLayout = (event: LayoutChangeEvent) => {
    if (section !== "podcasts" || hasScrolledToSection.current) {
      return;
    }
    hasScrolledToSection.current = true;
    scrollViewRef.current?.scrollTo({
      y: event.nativeEvent.layout.y,
      animated: true,
    });
  };

  const handleDeletePodcastsConfigPress = () => {
    clearTaddyPodcastsConfig();
    setShowDeletePodcastsAlertDialog(false);
    showSuccessToast(
      t("app.settings.podcastSettings.removePodcastConfigSuccessMessage"),
    );
  };

  const handleExportBackupPress = async () => {
    try {
      await exportBackup();
      showSuccessToast(t("app.settings.backupSettings.exportSuccessMessage"));
    } catch (error) {
      logError(error);
      showErrorToast(t("app.settings.backupSettings.exportErrorMessage"));
    }
  };

  // Finishing a restore re-routes through the logout → re-login flow so React
  // Query and the per-account stores are rebuilt cleanly for the restored
  // server, instead of being hot-swapped in place (which mixes content).
  const handleFinishRestore = () => {
    setShowRestartRequiredAlertDialog(false);
    const target = restoreTarget;
    setRestoreTarget(null);
    if (target?.serverId) {
      switchToServer(router, target.serverId, target.username ?? undefined);
    } else {
      useAuthBase.getState().logout();
      router.replace("/(auth)/login");
    }
  };

  const handleConfirmRestoreBackupPress = async () => {
    setShowRestoreConfirmAlertDialog(false);
    try {
      const backup = await pickBackupFile();
      if (!backup) return;
      const outcome = await restoreBackup(backup);
      setRestoreTarget(outcome);
      setShowRestartRequiredAlertDialog(true);
    } catch (error) {
      logError(error);
      const isValidationError = error instanceof z.ZodError;
      showErrorToast(
        t(
          isValidationError
            ? "app.settings.backupSettings.restoreInvalidFileMessage"
            : "app.settings.backupSettings.restoreErrorMessage",
        ),
      );
    }
  };

  return (
    <Box className="h-full">
      <Box className={cn("px-6 pb-6 flex-1", isWideLayout ? "mb-6" : "mt-6")}>
        <HStack
          className="items-center justify-between mb-6"
          style={{ paddingTop: insets.top }}
        >
          <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <Heading className="text-white text-center flex-1" size="lg">
            {t("app.settings.title")}
          </Heading>
          <Box className="w-6" />
        </HStack>
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom:
              insets.bottom + bottomTabBarHeight + floatingPlayerInset,
          }}
        >
          <VStack className="mb-6 gap-y-4">
            <SettingsSectionTitle
              title={t("app.settings.musicLibrarySettings.title")}
            />
            <SettingsActionRow
              layout="wide"
              label={t(
                "app.settings.musicLibrarySettings.scanMusicLibraryLabel",
              )}
              description={t(
                "app.settings.musicLibrarySettings.scanMusicLibraryDescription",
              )}
              actionLabel={t(
                "app.settings.musicLibrarySettings.scanMusicLibraryAction",
              )}
              onPress={handleMediaLibraryScanPress}
            />
            {!isLocal && (
              <HStack className="items-center gap-x-4 py-4 justify-between">
                <VStack className="gap-y-2 w-3/5">
                  <Heading className="text-white font-normal" size="md">
                    {t("app.settings.musicLibrarySettings.scanStatusLabel")}
                  </Heading>
                  <Text className="text-primary-100 text-sm">
                    {t(
                      "app.settings.musicLibrarySettings.scanStatusDescription",
                    )}
                  </Text>
                  {data?.scanStatus?.lastScan && (
                    <Text className="text-primary-100 text-sm">
                      {t(
                        "app.settings.musicLibrarySettings.scanStatusLastScan",
                        {
                          lastScan: formatDistanceToNow(
                            parseISO(data?.scanStatus?.lastScan || ""),
                          ),
                        },
                      )}
                    </Text>
                  )}
                </VStack>
                <Badge
                  className="rounded-full normal-case py-1 px-3 bg-emerald-100"
                  size="lg"
                  variant="solid"
                  action={data?.scanStatus?.scanning ? "warning" : "success"}
                >
                  <BadgeText className="normal-case text-center text-emerald-700">
                    {data?.scanStatus?.scanning
                      ? t(
                          "app.settings.musicLibrarySettings.scanStatuses.scanning",
                        )
                      : t(
                          "app.settings.musicLibrarySettings.scanStatuses.idle",
                        )}
                  </BadgeText>
                </Badge>
              </HStack>
            )}
            <Divider className="bg-primary-400" />
            {!isLocal && (
              <>
                <SettingsSectionTitle
                  title={t("app.settings.offlineSettings.title")}
                />
                <SettingsToggleRow
                  label={t("app.settings.offlineSettings.offlineModeLabel")}
                  description={t(
                    "app.settings.offlineSettings.offlineModeDescription",
                  )}
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
                <SettingsToggleRow
                  label={t(
                    "app.settings.offlineSettings.downloadsWifiOnlyLabel",
                  )}
                  description={t(
                    "app.settings.offlineSettings.downloadsWifiOnlyDescription",
                  )}
                  value={downloadsWifiOnly}
                  onToggle={(value) => setDownloadsWifiOnly(value)}
                />
                {offlineModeEnabled && downloadedTracksList.length > 0 && (
                  <SettingsActionRow
                    label={t(
                      "app.settings.offlineSettings.manageDownloadsLabel",
                    )}
                    description={t(
                      "app.settings.offlineSettings.manageDownloadsDescription",
                    )}
                    actionLabel={t(
                      "app.settings.offlineSettings.manageDownloadsAction",
                    )}
                    onPress={() => router.navigate("/offline-downloads")}
                  />
                )}
                <Divider className="bg-primary-400" />
              </>
            )}
            <SettingsSectionTitle
              title={t("app.settings.storageSettings.title")}
            />
            <StorageOverview refreshToken={storageRefreshToken} />
            <SettingsActionRow
              variant="danger"
              label={t("app.settings.cacheSettings.label")}
              description={t("app.settings.cacheSettings.description")}
              actionLabel={t("app.settings.cacheSettings.clearAction")}
              onPress={() => setShowClearCacheAlertDialog(true)}
            />
            <Divider className="bg-primary-400" />
            <SettingsSectionTitle
              title={t("app.settings.podcastSettings.title")}
              onLayout={handlePodcastSectionLayout}
            />
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
                  {t(
                    "app.settings.podcastSettings.configurePodcastsDescription",
                  )}
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
                className={cn(
                  "rounded-full normal-case py-1 px-3 bg-primary-100",
                  {
                    "bg-emerald-100": taddyPodcastApiKey && taddyPodcastUserId,
                  },
                )}
                size="lg"
                variant="solid"
                action={
                  taddyPodcastApiKey && taddyPodcastUserId
                    ? "warning"
                    : "success"
                }
              >
                <BadgeText
                  className={cn("normal-case text-center text-primary-700", {
                    "text-emerald-700":
                      taddyPodcastApiKey && taddyPodcastUserId,
                  })}
                >
                  {taddyPodcastApiKey && taddyPodcastUserId
                    ? t("app.settings.podcastSettings.statuses.active")
                    : t("app.settings.podcastSettings.statuses.inactive")}
                </BadgeText>
              </Badge>
            </HStack>
            <Divider className="bg-primary-400" />
            <SettingsSectionTitle
              title={t("app.settings.internetRadioStationsSettings.title")}
            />
            <SettingsSelectRow
              label={t(
                "app.settings.internetRadioStationsSettings.countryLabel",
              )}
              description={t(
                "app.settings.internetRadioStationsSettings.countryDescription",
              )}
              badgeText={radioCountryBadgeText}
              onPress={() => bottomSheetRadioCountryModalRef.current?.present()}
            />
            <SettingsSelectRow
              label={t("app.settings.internetRadioStationsSettings.tagsLabel")}
              description={t(
                "app.settings.internetRadioStationsSettings.tagsDescription",
              )}
              badgeText={t(
                "app.settings.internetRadioStationsSettings.tagsCount",
                { count: internetRadioFeedTags.length },
              )}
              onPress={() => bottomSheetRadioTagsModalRef.current?.present()}
            />
            <Divider className="bg-primary-400" />
            <SettingsSectionTitle
              title={t("app.settings.displaySettings.title")}
            />
            <FadeOutScaleDown
              onPress={() => bottomSheetLanguageModalRef.current?.present()}
            >
              <HStack className="items-center gap-x-4 py-4">
                <VStack className="gap-y-2">
                  <Heading className="text-white font-normal" size="md">
                    {t("app.settings.displaySettings.languageLabel")}
                  </Heading>
                  <Text className="text-primary-100 text-sm">
                    {t("app.settings.displaySettings.languageDescription")}
                  </Text>
                </VStack>
              </HStack>
            </FadeOutScaleDown>
            <SettingsToggleRow
              label={t("app.settings.displaySettings.createTabLabel")}
              description={t(
                "app.settings.displaySettings.createTabDescription",
              )}
              value={showAddTab}
              onToggle={(value) => setShowAddTab(value)}
            />
            <SettingsToggleRow
              label={t(
                "app.settings.displaySettings.showEmptyHomeSectionsLabel",
              )}
              description={t(
                "app.settings.displaySettings.showEmptyHomeSectionsDescription",
              )}
              value={showEmptyHomeSections}
              onToggle={(value) => setShowEmptyHomeSections(value)}
            />
            <Divider className="bg-primary-400" />
            <SettingsSectionTitle
              title={t("app.settings.playbackSettings.title")}
            />
            <SettingsToggleRow
              label={t("app.settings.playbackSettings.gaplessLabel")}
              description={t(
                "app.settings.playbackSettings.gaplessDescription",
              )}
              value={gaplessEnabled}
              onToggle={(value) => setGaplessEnabled(value)}
            />
            <SettingsToggleRow
              label={t("app.settings.playbackSettings.endlessPlaybackLabel")}
              description={t(
                "app.settings.playbackSettings.endlessPlaybackDescription",
              )}
              value={endlessPlaybackEnabled}
              onToggle={(value) => setEndlessPlaybackEnabled(value)}
            />
            <SettingsStepperRow
              label={t("app.settings.playbackSettings.crossfadeLabel")}
              description={t(
                "app.settings.playbackSettings.crossfadeDescription",
              )}
              valueText={
                crossfadeSeconds === 0
                  ? t("app.settings.playbackSettings.crossfadeOff")
                  : t("app.settings.playbackSettings.crossfadeSeconds", {
                      seconds: crossfadeSeconds,
                    })
              }
              onDecrement={() => adjustCrossfade(-1)}
              onIncrement={() => adjustCrossfade(1)}
            />
            {isEqualizerAvailable() && (
              <SettingsActionRow
                layout="wide"
                label={t("app.settings.playbackSettings.equalizerLabel")}
                description={t(
                  "app.settings.playbackSettings.equalizerDescription",
                )}
                actionLabel={t("app.settings.playbackSettings.equalizerAction")}
                onPress={handleOpenEqualizerPress}
              />
            )}
            {capabilities.playQueueSync && (
              <SettingsSelectRow
                label={t("app.settings.playbackSettings.queueSyncLabel")}
                description={t(
                  "app.settings.playbackSettings.queueSyncDescription",
                )}
                badgeText={t(
                  `app.settings.playbackSettings.queueSyncOptions.${queueSyncPriority}.label`,
                )}
                onPress={() => bottomSheetQueueSyncModalRef.current?.present()}
              />
            )}
            <Divider className="bg-primary-400" />
            <SettingsSectionTitle
              title={t("app.settings.streamingSettings.title")}
            />
            {!isLocal && (
              <>
                <SettingsSelectRow
                  label={t("app.settings.streamingSettings.audioQualityLabel")}
                  description={t(
                    "app.settings.streamingSettings.audioQualityDescription",
                  )}
                  badgeText={formatBitRate(maxBitRate)}
                  onPress={() => bottomSheetBitRateModalRef.current?.present()}
                />
                <SettingsSelectRow
                  label={t(
                    "app.settings.streamingSettings.cellularAudioQualityLabel",
                  )}
                  description={t(
                    "app.settings.streamingSettings.cellularAudioQualityDescription",
                  )}
                  badgeText={formatBitRate(cellularMaxBitRate)}
                  onPress={() =>
                    bottomSheetCellularBitRateModalRef.current?.present()
                  }
                />
              </>
            )}
            {capabilities.streamFormatSelection && (
              <SettingsSelectRow
                label={t("app.settings.streamingSettings.streamingFormatLabel")}
                description={t(
                  "app.settings.streamingSettings.streamingFormatDescription",
                )}
                badgeText={t(
                  `app.settings.streamingSettings.streamingFormatOptions.${streamingFormat}`,
                )}
                onPress={() =>
                  bottomSheetStreamingFormatModalRef.current?.present()
                }
              />
            )}
            {capabilities.replayGain && (
              <SettingsSelectRow
                label={t("app.settings.streamingSettings.replayGainLabel")}
                description={t(
                  "app.settings.streamingSettings.replayGainDescription",
                )}
                badgeText={t(
                  `app.settings.streamingSettings.replayGainModes.${replayGainMode}`,
                )}
                onPress={() => bottomSheetReplayGainModalRef.current?.present()}
              />
            )}
            {capabilities.replayGain && replayGainMode !== "off" && (
              <SettingsStepperRow
                label={t(
                  "app.settings.streamingSettings.replayGainPreampLabel",
                )}
                description={t(
                  "app.settings.streamingSettings.replayGainPreampDescription",
                )}
                valueText={t(
                  "app.settings.streamingSettings.replayGainPreampValue",
                  {
                    db:
                      replayGainPreampDb > 0
                        ? `+${replayGainPreampDb}`
                        : replayGainPreampDb,
                  },
                )}
                valueClassName="w-16"
                onDecrement={() => adjustPreamp(-1)}
                onIncrement={() => adjustPreamp(1)}
              />
            )}
            <Divider className="bg-primary-400" />
            <SettingsSectionTitle
              title={t("app.settings.contentSettings.title")}
            />
            <SettingsActionRow
              variant="danger"
              label={t("app.settings.contentSettings.recentSearchesLabel")}
              description={t(
                "app.settings.contentSettings.recentSearchesDescription",
              )}
              actionLabel={t("app.shared.delete")}
              onPress={() => setShowRecentSearchesAlertDialog(true)}
            />
            <SettingsActionRow
              variant="danger"
              label={t("app.settings.contentSettings.recentPlaysLabel")}
              description={t(
                "app.settings.contentSettings.recentPlaysDescription",
              )}
              actionLabel={t("app.shared.delete")}
              onPress={() => setShowRecentPlaysAlertDialog(true)}
            />
            <SettingsActionRow
              variant="danger"
              label={t("app.settings.contentSettings.activityLabel")}
              description={t(
                "app.settings.contentSettings.activityDescription",
              )}
              actionLabel={t("app.shared.delete")}
              onPress={() => setShowActivityAlertDialog(true)}
            />
            <Divider className="bg-primary-400" />
            <SettingsSectionTitle
              title={t("app.settings.backupSettings.title")}
            />
            <SettingsActionRow
              label={t("app.settings.backupSettings.exportLabel")}
              description={t("app.settings.backupSettings.exportDescription")}
              actionLabel={t("app.settings.backupSettings.exportAction")}
              onPress={handleExportBackupPress}
            />
            <SettingsActionRow
              variant="danger"
              label={t("app.settings.backupSettings.restoreLabel")}
              description={t("app.settings.backupSettings.restoreDescription")}
              actionLabel={t("app.settings.backupSettings.restoreAction")}
              onPress={() => setShowRestoreConfirmAlertDialog(true)}
            />
            <Divider className="bg-primary-400" />
            <SettingsSectionTitle
              title={t("app.settings.securitySettings.title")}
            />
            <SettingsActionRow
              label={t(
                "app.settings.securitySettings.trustedCertificatesLabel",
              )}
              description={t(
                "app.settings.securitySettings.trustedCertificatesDescription",
              )}
              actionLabel={t(
                "app.settings.securitySettings.trustedCertificatesAction",
              )}
              // Cast until expo-router regenerates typed routes for the new
              // screen on the next dev-server/prebuild run.
              onPress={() => router.navigate("/trusted-certificates" as Href)}
            />
          </VStack>
        </ScrollView>
      </Box>
      <SearchableSelectSheet
        ref={bottomSheetRadioCountryModalRef}
        onSheetPositionChange={handleRadioCountrySheetPositionChange}
        title={t("app.settings.internetRadioStationsSettings.countryLabel")}
        anyLabel={t(
          "app.settings.internetRadioStationsSettings.countryAutomatic",
        )}
        options={radioCountryOptions}
        selectedValue={internetRadioCountryCode ?? undefined}
        onSelect={(value) => {
          setInternetRadioCountryCode(value || null);
          bottomSheetRadioCountryModalRef.current?.dismiss();
        }}
        emerald={emerald500}
      />
      <RadioFeedTagsSheet
        modalRef={bottomSheetRadioTagsModalRef}
        onChange={handleRadioTagsSheetPositionChange}
      />
      <OptionsBottomSheetModal
        modalRef={bottomSheetLanguageModalRef}
        onChange={handleSheetPositionChange}
        options={SupportedLanguages.map((language) => ({
          value: language,
          label: t(`app.shared.languages.${language}`, { lng: language }),
        }))}
        selectedValue={locale}
        onSelect={setLocale}
      />
      <OptionsBottomSheetModal
        modalRef={bottomSheetBitRateModalRef}
        onChange={handleBitRateSheetPositionChange}
        options={bitRateOptions.map((option) => ({
          value: option,
          label: formatBitRate(option),
        }))}
        selectedValue={maxBitRate}
        onSelect={setMaxBitRate}
      />
      <OptionsBottomSheetModal
        modalRef={bottomSheetCellularBitRateModalRef}
        onChange={handleCellularBitRateSheetPositionChange}
        options={bitRateOptions.map((option) => ({
          value: option,
          label: formatBitRate(option),
        }))}
        selectedValue={cellularMaxBitRate}
        onSelect={setCellularMaxBitRate}
      />
      <OptionsBottomSheetModal
        modalRef={bottomSheetStreamingFormatModalRef}
        onChange={handleStreamingFormatSheetPositionChange}
        header={t("app.settings.streamingSettings.streamingFormatLabel")}
        headerDescription={t(
          "app.settings.streamingSettings.streamingFormatDescription",
        )}
        options={streamingFormatOptions.map((option) => ({
          value: option,
          label: t(
            `app.settings.streamingSettings.streamingFormatOptions.${option}`,
          ),
        }))}
        selectedValue={streamingFormat}
        onSelect={setStreamingFormat}
        dismissOnSelect
      />
      <OptionsBottomSheetModal
        modalRef={bottomSheetReplayGainModalRef}
        onChange={handleReplayGainSheetPositionChange}
        options={replayGainOptions.map((option) => ({
          value: option,
          label: t(`app.settings.streamingSettings.replayGainModes.${option}`),
        }))}
        selectedValue={replayGainMode}
        onSelect={setReplayGainMode}
      />
      <OptionsBottomSheetModal
        modalRef={bottomSheetQueueSyncModalRef}
        onChange={handleQueueSyncSheetPositionChange}
        header={t("app.settings.playbackSettings.queueSyncLabel")}
        headerDescription={t(
          "app.settings.playbackSettings.queueSyncDescription",
        )}
        options={queueSyncOptions.map((option) => ({
          value: option,
          label: t(
            `app.settings.playbackSettings.queueSyncOptions.${option}.label`,
          ),
          description: t(
            `app.settings.playbackSettings.queueSyncOptions.${option}.description`,
          ),
        }))}
        selectedValue={queueSyncPriority}
        onSelect={setQueueSyncPriority}
        dismissOnSelect
      />
      <ConfirmActionDialog
        isOpen={showClearCacheAlertDialog}
        onClose={() => setShowClearCacheAlertDialog(false)}
        title={t("app.settings.cacheSettings.confirmTitle")}
        description={t("app.settings.cacheSettings.confirmDescription")}
        cancelLabel={t("app.shared.cancel")}
        confirmLabel={t("app.shared.clear")}
        onConfirm={handleClearCachePress}
      />
      <ConfirmActionDialog
        isOpen={showRecentPlaysAlertDialog}
        onClose={() => setShowRecentPlaysAlertDialog(false)}
        title={t("app.settings.contentSettings.recentPlaysConfirmTitle")}
        description={t(
          "app.settings.contentSettings.recentPlaysConfirmDescription",
        )}
        cancelLabel={t("app.shared.cancel")}
        confirmLabel={t("app.shared.delete")}
        onConfirm={handleDeleteRecentPlaysPress}
      />
      <ConfirmActionDialog
        isOpen={showRecentSearchesAlertDialog}
        onClose={() => setShowRecentSearchesAlertDialog(false)}
        title={t("app.settings.contentSettings.recentSearchesConfirmTitle")}
        description={t(
          "app.settings.contentSettings.recentSearchesConfirmDescription",
        )}
        cancelLabel={t("app.shared.cancel")}
        confirmLabel={t("app.shared.delete")}
        onConfirm={handleDeleteRecentSearchesPress}
      />
      <ConfirmActionDialog
        isOpen={showActivityAlertDialog}
        onClose={() => setShowActivityAlertDialog(false)}
        title={t("app.settings.contentSettings.activityConfirmTitle")}
        description={t(
          "app.settings.contentSettings.activityConfirmDescription",
        )}
        cancelLabel={t("app.shared.cancel")}
        confirmLabel={t("app.shared.delete")}
        onConfirm={handleDeleteActivityPress}
      />
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
      <ConfirmActionDialog
        isOpen={showRestoreConfirmAlertDialog}
        onClose={() => setShowRestoreConfirmAlertDialog(false)}
        title={t("app.settings.backupSettings.restoreConfirmTitle")}
        description={t("app.settings.backupSettings.restoreConfirmDescription")}
        cancelLabel={t("app.shared.cancel")}
        confirmLabel={t("app.settings.backupSettings.restoreAction")}
        confirmVariant="danger"
        onConfirm={handleConfirmRestoreBackupPress}
      />
      <ConfirmActionDialog
        isOpen={showRestartRequiredAlertDialog}
        onClose={() => setShowRestartRequiredAlertDialog(false)}
        title={t("app.settings.backupSettings.restartRequiredTitle")}
        description={t(
          "app.settings.backupSettings.restartRequiredDescription",
        )}
        confirmLabel={t("app.settings.backupSettings.restartRequiredAction")}
        onConfirm={handleFinishRestore}
      />
    </Box>
  );
}
