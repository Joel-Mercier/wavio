import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useForm, useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { parseISO } from "date-fns/parseISO";
import * as Application from "expo-application";
import { useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import Check from "lucide-react-native/dist/esm/icons/check.mjs";
import ChevronDownIcon from "lucide-react-native/dist/esm/icons/chevron-down.mjs";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import * as z from "zod";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import StorageOverview from "@/components/settings/StorageOverview";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Divider } from "@/components/ui/divider";
import { FormControl } from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { ScrollView } from "@/components/ui/scroll-view";
import { Switch } from "@/components/ui/switch";
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
import { useRemainingApiRequests } from "@/hooks/taddyPodcasts/useSystem";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  useDownloadedTracksCount,
  useDownloadedTracksList,
  useOfflineDownloads,
  useTotalDownloadSize,
} from "@/hooks/useOfflineDownloads";
import { exportBackup, pickBackupFile, restoreBackup } from "@/services/backup";
import {
  isEqualizerAvailable,
  openSystemEqualizer,
} from "@/services/equalizer";
import { Country, Language } from "@/services/taddyPodcasts/types";
import useActivity from "@/stores/activity";
import useApp from "@/stores/app";
import { useAuthBase } from "@/stores/auth";
import usePodcasts from "@/stores/podcasts";
import useRecentPlays from "@/stores/recentPlays";
import useRecentSearches from "@/stores/recentSearches";
import { formatDistanceToNow } from "@/utils/date";
import { niceBytes } from "@/utils/fileSize";
import { logError } from "@/utils/log";
import { switchToServer } from "@/utils/switchServer";
import { cn } from "@/utils/tailwind";
import {
  Select,
  SelectBackdrop,
  SelectContent,
  SelectDragIndicator,
  SelectDragIndicatorWrapper,
  SelectFlatList,
  SelectIcon,
  SelectInput,
  SelectItem,
  SelectPortal,
  SelectTrigger,
} from "../ui/select";

const podcastConfigSchema = z.object({
  apiKey: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  language: z.enum(Language),
  country: z.enum(Country),
});

export default function SettingsDetail() {
  const [gray500, emerald500, white] = Uniwind.getCSSVariable([
    "--color-gray-500",
    "--color-emerald-500",
    "--color-white",
  ]) as string[];
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
  const bottomSheetReplayGainModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange: handleReplayGainSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetReplayGainModalRef);
  const bottomSheetQueueSyncModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange: handleQueueSyncSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetQueueSyncModalRef);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const toast = useToast();
  const capabilities = useCapabilities();
  const locale = useApp((store) => store.locale);
  const setLocale = useApp((store) => store.setLocale);
  const showAddTab = useApp((store) => store.showAddTab);
  const setShowAddTab = useApp((store) => store.setShowAddTab);
  const maxBitRate = useApp((store) => store.maxBitRate);
  const setMaxBitRate = useApp((store) => store.setMaxBitRate);
  const cellularMaxBitRate = useApp((store) => store.cellularMaxBitRate);
  const setCellularMaxBitRate = useApp((store) => store.setCellularMaxBitRate);
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
  const setTaddyPodcastsConfig = usePodcasts(
    (store) => store.setTaddyPodcastsConfig,
  );
  const clearTaddyPodcastsConfig = usePodcasts(
    (store) => store.clearTaddyPodcastsConfig,
  );
  const taddyPodcastApiKey = usePodcasts((store) => store.taddyPodcastsApiKey);
  const taddyPodcastUserId = usePodcasts((store) => store.taddyPodcastsUserId);
  const taddyPodcastLanguage = usePodcasts(
    (store) => store.taddyPodcastsLanguage,
  );
  const taddyPodcastCountry = usePodcasts(
    (store) => store.taddyPodcastsCountry,
  );
  const clearRecentPlays = useRecentPlays((store) => store.clearRecentPlays);
  const clearRecentSearches = useRecentSearches(
    (store) => store.clearRecentSearches,
  );
  const clearActivity = useActivity((store) => store.clearActivity);
  const doStartScan = useStartScan();
  const { data, isLoading, error } = useGetScanStatus();
  const { data: remainingApiRequests } = useRemainingApiRequests(
    !!(taddyPodcastApiKey && taddyPodcastUserId),
  );

  const { offlineModeEnabled, setOfflineModeEnabled } = useOfflineDownloads();
  const downloadedTracksCount = useDownloadedTracksCount();
  const totalDownloadSize = useTotalDownloadSize();
  const downloadedTracksList = useDownloadedTracksList();
  const { data: starredTracksData } = useStarred2({});
  const totalTracksToDownload = starredTracksData?.starred2?.song?.length ?? 0;
  const podcastConfigForm = useForm({
    defaultValues: {
      apiKey: taddyPodcastApiKey,
      userId: taddyPodcastUserId,
      language: taddyPodcastLanguage,
      country: taddyPodcastCountry,
    },
    validators: {
      onChange: podcastConfigSchema,
    },
    onSubmit: ({ value }) => {
      setTaddyPodcastsConfig(value);
      setShowPodcastsAlertDialog(false);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t(
                "app.settings.podcastSettings.configurePodcastsSuccessMessage",
              )}
            </ToastDescription>
          </Toast>
        ),
      });
    },
  });

  const isPodcastConfigDirty = useStore(
    podcastConfigForm.store,
    (state) => state.isDirty,
  );

  const handlePresentLanguageModalPress = () => {
    bottomSheetLanguageModalRef.current?.present();
  };

  const handlePresentBitRateModalPress = () => {
    bottomSheetBitRateModalRef.current?.present();
  };

  const handlePresentCellularBitRateModalPress = () => {
    bottomSheetCellularBitRateModalRef.current?.present();
  };

  const handlePresentReplayGainModalPress = () => {
    bottomSheetReplayGainModalRef.current?.present();
  };

  const handlePresentQueueSyncModalPress = () => {
    bottomSheetQueueSyncModalRef.current?.present();
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
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.settings.playbackSettings.equalizerErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  const bitRateOptions: (number | null)[] = [null, 64, 96, 128, 192, 256, 320];

  const formatBitRate = (value: number | null) =>
    value === null
      ? t("app.settings.streamingSettings.audioQualityOriginal")
      : t("app.settings.streamingSettings.audioQualityKbps", {
          bitrate: value,
        });

  const handleCloseRecentPlaysAlertDialog = () => {
    setShowRecentPlaysAlertDialog(false);
  };

  const handleCloseRecentSearchesAlertDialog = () => {
    setShowRecentSearchesAlertDialog(false);
  };

  const handleCloseDeletePodcastsAlertDialog = () => {
    setShowDeletePodcastsAlertDialog(false);
  };

  const handleCloseClearCacheAlertDialog = () => {
    setShowClearCacheAlertDialog(false);
  };

  const handleClearCachePress = () => {
    // Clears only the active server's query cache (in-memory + persisted blob).
    // Downloaded files are untouched.
    queryClient.clear();
    void queryPersister.removeClient();
    setShowClearCacheAlertDialog(false);
    setStorageRefreshToken((value) => value + 1);
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {t("app.settings.cacheSettings.successMessage")}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  const handleDeleteRecentPlaysPress = () => {
    clearRecentPlays();
    setShowRecentPlaysAlertDialog(false);
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {t("app.settings.contentSettings.recentPlaysSuccessMessage")}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  const handleDeleteRecentSearchesPress = () => {
    clearRecentSearches();
    setShowRecentSearchesAlertDialog(false);
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {t("app.settings.contentSettings.recentSearchesSuccessMessage")}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  const handleCloseActivityAlertDialog = () => {
    setShowActivityAlertDialog(false);
  };

  const handleDeleteActivityPress = () => {
    clearActivity();
    setShowActivityAlertDialog(false);
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {t("app.settings.contentSettings.activitySuccessMessage")}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  const handleMediaLibraryScanPress = () => {
    doStartScan.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast.show({
          placement: "top",
          duration: 3000,
          render: () => (
            <Toast action="success">
              <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
              <ToastDescription>
                {t(
                  "app.settings.musicLibrarySettings.scanMusicLibrarySuccessDescription",
                )}
              </ToastDescription>
            </Toast>
          ),
        });
      },
      onError: (error) => {
        logError(error);
        toast.show({
          placement: "top",
          duration: 3000,
          render: () => (
            <Toast action="error">
              <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
              <ToastDescription>
                {t(
                  "app.settings.musicLibrarySettings.scanMusicLibraryErrorDescription",
                )}
              </ToastDescription>
            </Toast>
          ),
        });
      },
    });
  };

  const handleConfigurePodcastsPress = () => {
    setShowPodcastsAlertDialog(true);
  };

  const handleClosePodcastsAlertDialog = () => {
    setShowPodcastsAlertDialog(false);
  };

  const handleDeletePodcastsConfigPress = () => {
    clearTaddyPodcastsConfig();
    setShowDeletePodcastsAlertDialog(false);
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {t(
              "app.settings.podcastSettings.removePodcastConfigSuccessMessage",
            )}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  const handleExportBackupPress = async () => {
    try {
      await exportBackup();
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.settings.backupSettings.exportSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    } catch (error) {
      logError(error);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.settings.backupSettings.exportErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  const handleCloseRestoreConfirmAlertDialog = () => {
    setShowRestoreConfirmAlertDialog(false);
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
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t(
                isValidationError
                  ? "app.settings.backupSettings.restoreInvalidFileMessage"
                  : "app.settings.backupSettings.restoreErrorMessage",
              )}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  return (
    <Box className="h-full">
      <Box className="px-6 mt-6 pb-6 flex-1">
        <HStack
          className="items-center justify-between mb-6"
          style={{ paddingTop: insets.top }}
        >
          <FadeOutScaleDown onPress={() => router.back()}>
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <Heading className="text-white text-center flex-1" size="lg">
            {t("app.settings.title")}
          </Heading>
          <Box className="w-6" />
        </HStack>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom:
              insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
          }}
        >
          <VStack className="mb-6 gap-y-4">
            <Heading className="text-white mt-4" size="lg">
              {t("app.settings.musicLibrarySettings.title")}
            </Heading>
            <HStack className="items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-3/5">
                <Heading className="text-white font-normal" size="md">
                  {t("app.settings.musicLibrarySettings.scanMusicLibraryLabel")}
                </Heading>
                <Text className="text-primary-100 text-sm">
                  {t(
                    "app.settings.musicLibrarySettings.scanMusicLibraryDescription",
                  )}
                </Text>
              </VStack>
              <FadeOutScaleDown
                onPress={handleMediaLibraryScanPress}
                className="items-center justify-center py-2 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
              >
                <Text className="text-primary-800 font-bold text-lg">
                  {t(
                    "app.settings.musicLibrarySettings.scanMusicLibraryAction",
                  )}
                </Text>
              </FadeOutScaleDown>
            </HStack>
            <HStack className="items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-3/5">
                <Heading className="text-white font-normal" size="md">
                  {t("app.settings.musicLibrarySettings.scanStatusLabel")}
                </Heading>
                <Text className="text-primary-100 text-sm">
                  {t("app.settings.musicLibrarySettings.scanStatusDescription")}
                </Text>
                {data?.scanStatus?.lastScan && (
                  <Text className="text-primary-100 text-sm">
                    {t("app.settings.musicLibrarySettings.scanStatusLastScan", {
                      lastScan: formatDistanceToNow(
                        parseISO(data?.scanStatus?.lastScan || ""),
                      ),
                    })}
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
                    : t("app.settings.musicLibrarySettings.scanStatuses.idle")}
                </BadgeText>
              </Badge>
            </HStack>
            <Divider className="bg-primary-400" />
            <Heading className="text-white mt-4" size="lg">
              {t("app.settings.offlineSettings.title")}
            </Heading>
            <HStack className="items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-3/5">
                <Heading className="text-white font-normal" size="md">
                  {t("app.settings.offlineSettings.offlineModeLabel")}
                </Heading>
                <Text className="text-primary-100 text-sm">
                  {t("app.settings.offlineSettings.offlineModeDescription")}
                </Text>
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
              </VStack>
              <Switch
                size="md"
                trackColor={{
                  false: gray500,
                  true: emerald500,
                }}
                thumbColor={white}
                ios_backgroundColor={white}
                value={offlineModeEnabled}
                onToggle={(value) => setOfflineModeEnabled(value)}
              />
            </HStack>
            <HStack className="items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-3/5">
                <Heading className="text-white font-normal" size="md">
                  {t("app.settings.offlineSettings.downloadsWifiOnlyLabel")}
                </Heading>
                <Text className="text-primary-100 text-sm">
                  {t(
                    "app.settings.offlineSettings.downloadsWifiOnlyDescription",
                  )}
                </Text>
              </VStack>
              <Switch
                size="md"
                trackColor={{
                  false: gray500,
                  true: emerald500,
                }}
                thumbColor={white}
                ios_backgroundColor={white}
                value={downloadsWifiOnly}
                onToggle={(value) => setDownloadsWifiOnly(value)}
              />
            </HStack>
            {offlineModeEnabled && downloadedTracksList.length > 0 && (
              <HStack className="items-center gap-x-4 py-4 justify-between flex-1">
                <VStack className="gap-y-2 w-1/2">
                  <Heading className="text-white font-normal" size="md">
                    {t("app.settings.offlineSettings.manageDownloadsLabel")}
                  </Heading>
                  <Text className="text-primary-100 text-sm">
                    {t(
                      "app.settings.offlineSettings.manageDownloadsDescription",
                    )}
                  </Text>
                </VStack>
                <FadeOutScaleDown
                  onPress={() => router.navigate("/offline-downloads")}
                  className="flex-1 items-center justify-center py-2 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
                >
                  <Text
                    numberOfLines={1}
                    className="text-primary-800 font-bold text-lg"
                  >
                    {t("app.settings.offlineSettings.manageDownloadsAction")}
                  </Text>
                </FadeOutScaleDown>
              </HStack>
            )}
            <Divider className="bg-primary-400" />
            <Heading className="text-white mt-4" size="lg">
              {t("app.settings.storageSettings.title")}
            </Heading>
            <StorageOverview refreshToken={storageRefreshToken} />
            <HStack className="items-center gap-x-4 py-4 justify-between flex-1">
              <VStack className="gap-y-2 w-1/2">
                <Heading className="text-white font-normal" size="md">
                  {t("app.settings.cacheSettings.label")}
                </Heading>
                <Text className="text-primary-100 text-sm">
                  {t("app.settings.cacheSettings.description")}
                </Text>
              </VStack>
              <FadeOutScaleDown
                onPress={() => setShowClearCacheAlertDialog(true)}
                className="flex-1 items-center justify-center py-2 px-8 border border-red-500 bg-red-500 rounded-full"
              >
                <Text
                  numberOfLines={1}
                  className="text-primary-800 font-bold text-lg"
                >
                  {t("app.settings.cacheSettings.clearAction")}
                </Text>
              </FadeOutScaleDown>
            </HStack>
            <Divider className="bg-primary-400" />
            <Heading className="text-white mt-4" size="lg">
              {t("app.settings.podcastSettings.title")}
            </Heading>
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
                  onPress={handleConfigurePodcastsPress}
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
            <Heading className="text-white mt-4" size="lg">
              {t("app.settings.displaySettings.title")}
            </Heading>
            <FadeOutScaleDown onPress={handlePresentLanguageModalPress}>
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
            <HStack className="items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-3/5">
                <Heading className="text-white font-normal" size="md">
                  {t("app.settings.displaySettings.createTabLabel")}
                </Heading>
                <Text className="text-primary-100 text-sm">
                  {t("app.settings.displaySettings.createTabDescription")}
                </Text>
              </VStack>
              <Switch
                size="md"
                trackColor={{
                  false: gray500,
                  true: emerald500,
                }}
                thumbColor={white}
                ios_backgroundColor={white}
                value={showAddTab}
                onToggle={(value) => setShowAddTab(value)}
              />
            </HStack>
            <Divider className="bg-primary-400" />
            <Heading className="text-white mt-4" size="lg">
              {t("app.settings.playbackSettings.title")}
            </Heading>
            <HStack className="items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-3/5">
                <Heading className="text-white font-normal" size="md">
                  {t("app.settings.playbackSettings.gaplessLabel")}
                </Heading>
                <Text className="text-primary-100 text-sm">
                  {t("app.settings.playbackSettings.gaplessDescription")}
                </Text>
              </VStack>
              <Switch
                size="md"
                trackColor={{
                  false: gray500,
                  true: emerald500,
                }}
                thumbColor={white}
                ios_backgroundColor={white}
                value={gaplessEnabled}
                onToggle={(value) => setGaplessEnabled(value)}
              />
            </HStack>
            <HStack className="items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-3/5">
                <Heading className="text-white font-normal" size="md">
                  {t("app.settings.playbackSettings.endlessPlaybackLabel")}
                </Heading>
                <Text className="text-primary-100 text-sm">
                  {t(
                    "app.settings.playbackSettings.endlessPlaybackDescription",
                  )}
                </Text>
              </VStack>
              <Switch
                size="md"
                trackColor={{
                  false: gray500,
                  true: emerald500,
                }}
                thumbColor={white}
                ios_backgroundColor={white}
                value={endlessPlaybackEnabled}
                onToggle={(value) => setEndlessPlaybackEnabled(value)}
              />
            </HStack>
            <HStack className="items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-1/2">
                <Heading className="text-white font-normal" size="md">
                  {t("app.settings.playbackSettings.crossfadeLabel")}
                </Heading>
                <Text className="text-primary-100 text-sm">
                  {t("app.settings.playbackSettings.crossfadeDescription")}
                </Text>
              </VStack>
              <HStack className="items-center gap-x-3">
                <FadeOutScaleDown
                  onPress={() => adjustCrossfade(-1)}
                  className="items-center justify-center w-10 h-10 border border-emerald-500 bg-emerald-500 rounded-full"
                >
                  <Text className="text-primary-800 font-bold text-lg">-</Text>
                </FadeOutScaleDown>
                <Text className="text-white font-bold text-center">
                  {crossfadeSeconds === 0
                    ? t("app.settings.playbackSettings.crossfadeOff")
                    : t("app.settings.playbackSettings.crossfadeSeconds", {
                        seconds: crossfadeSeconds,
                      })}
                </Text>
                <FadeOutScaleDown
                  onPress={() => adjustCrossfade(1)}
                  className="items-center justify-center w-10 h-10 border border-emerald-500 bg-emerald-500 rounded-full"
                >
                  <Text className="text-primary-800 font-bold text-lg">+</Text>
                </FadeOutScaleDown>
              </HStack>
            </HStack>
            {isEqualizerAvailable() && (
              <HStack className="items-center gap-x-4 py-4 justify-between">
                <VStack className="gap-y-2 w-3/5">
                  <Heading className="text-white font-normal" size="md">
                    {t("app.settings.playbackSettings.equalizerLabel")}
                  </Heading>
                  <Text className="text-primary-100 text-sm">
                    {t("app.settings.playbackSettings.equalizerDescription")}
                  </Text>
                </VStack>
                <FadeOutScaleDown
                  onPress={handleOpenEqualizerPress}
                  className="items-center justify-center py-2 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
                >
                  <Text className="text-primary-800 font-bold text-lg">
                    {t("app.settings.playbackSettings.equalizerAction")}
                  </Text>
                </FadeOutScaleDown>
              </HStack>
            )}
            {capabilities.playQueueSync && (
              <FadeOutScaleDown onPress={handlePresentQueueSyncModalPress}>
                <HStack className="items-center gap-x-4 py-4 justify-between">
                  <VStack className="gap-y-2 w-1/2">
                    <Heading className="text-white font-normal" size="md">
                      {t("app.settings.playbackSettings.queueSyncLabel")}
                    </Heading>
                    <Text className="text-primary-100 text-sm">
                      {t("app.settings.playbackSettings.queueSyncDescription")}
                    </Text>
                  </VStack>
                  <Badge
                    className="rounded-full normal-case py-1 px-3 bg-emerald-100"
                    size="lg"
                    variant="solid"
                    action="success"
                  >
                    <BadgeText className="normal-case text-center text-emerald-700">
                      {t(
                        `app.settings.playbackSettings.queueSyncOptions.${queueSyncPriority}.label`,
                      )}
                    </BadgeText>
                  </Badge>
                </HStack>
              </FadeOutScaleDown>
            )}
            <Divider className="bg-primary-400" />
            <Heading className="text-white mt-4" size="lg">
              {t("app.settings.streamingSettings.title")}
            </Heading>
            <FadeOutScaleDown onPress={handlePresentBitRateModalPress}>
              <HStack className="items-center gap-x-4 py-4 justify-between">
                <VStack className="gap-y-2 w-1/2">
                  <Heading className="text-white font-normal" size="md">
                    {t("app.settings.streamingSettings.audioQualityLabel")}
                  </Heading>
                  <Text className="text-primary-100 text-sm">
                    {t(
                      "app.settings.streamingSettings.audioQualityDescription",
                    )}
                  </Text>
                </VStack>
                <Badge
                  className="rounded-full normal-case py-1 px-3 bg-emerald-100"
                  size="lg"
                  variant="solid"
                  action="success"
                >
                  <BadgeText className="normal-case text-center text-emerald-700">
                    {formatBitRate(maxBitRate)}
                  </BadgeText>
                </Badge>
              </HStack>
            </FadeOutScaleDown>
            <FadeOutScaleDown onPress={handlePresentCellularBitRateModalPress}>
              <HStack className="items-center gap-x-4 py-4 justify-between">
                <VStack className="gap-y-2 w-1/2">
                  <Heading className="text-white font-normal" size="md">
                    {t(
                      "app.settings.streamingSettings.cellularAudioQualityLabel",
                    )}
                  </Heading>
                  <Text className="text-primary-100 text-sm">
                    {t(
                      "app.settings.streamingSettings.cellularAudioQualityDescription",
                    )}
                  </Text>
                </VStack>
                <Badge
                  className="rounded-full normal-case py-1 px-3 bg-emerald-100"
                  size="lg"
                  variant="solid"
                  action="success"
                >
                  <BadgeText className="normal-case text-center text-emerald-700">
                    {formatBitRate(cellularMaxBitRate)}
                  </BadgeText>
                </Badge>
              </HStack>
            </FadeOutScaleDown>
            {capabilities.replayGain && (
              <FadeOutScaleDown onPress={handlePresentReplayGainModalPress}>
                <HStack className="items-center gap-x-4 py-4 justify-between">
                  <VStack className="gap-y-2 w-1/2">
                    <Heading className="text-white font-normal" size="md">
                      {t("app.settings.streamingSettings.replayGainLabel")}
                    </Heading>
                    <Text className="text-primary-100 text-sm">
                      {t(
                        "app.settings.streamingSettings.replayGainDescription",
                      )}
                    </Text>
                  </VStack>
                  <Badge
                    className="rounded-full normal-case py-1 px-3 bg-emerald-100"
                    size="lg"
                    variant="solid"
                    action="success"
                  >
                    <BadgeText className="normal-case text-center text-emerald-700">
                      {t(
                        `app.settings.streamingSettings.replayGainModes.${replayGainMode}`,
                      )}
                    </BadgeText>
                  </Badge>
                </HStack>
              </FadeOutScaleDown>
            )}
            {capabilities.replayGain && replayGainMode !== "off" && (
              <HStack className="items-center gap-x-4 py-4 justify-between">
                <VStack className="gap-y-2 w-1/2">
                  <Heading className="text-white font-normal" size="md">
                    {t("app.settings.streamingSettings.replayGainPreampLabel")}
                  </Heading>
                  <Text className="text-primary-100 text-sm">
                    {t(
                      "app.settings.streamingSettings.replayGainPreampDescription",
                    )}
                  </Text>
                </VStack>
                <HStack className="items-center gap-x-3">
                  <FadeOutScaleDown
                    onPress={() => adjustPreamp(-1)}
                    className="items-center justify-center w-10 h-10 border border-emerald-500 bg-emerald-500 rounded-full"
                  >
                    <Text className="text-primary-800 font-bold text-lg">
                      -
                    </Text>
                  </FadeOutScaleDown>
                  <Text className="text-white font-bold w-16 text-center">
                    {t("app.settings.streamingSettings.replayGainPreampValue", {
                      db:
                        replayGainPreampDb > 0
                          ? `+${replayGainPreampDb}`
                          : replayGainPreampDb,
                    })}
                  </Text>
                  <FadeOutScaleDown
                    onPress={() => adjustPreamp(1)}
                    className="items-center justify-center w-10 h-10 border border-emerald-500 bg-emerald-500 rounded-full"
                  >
                    <Text className="text-primary-800 font-bold text-lg">
                      +
                    </Text>
                  </FadeOutScaleDown>
                </HStack>
              </HStack>
            )}
            <Divider className="bg-primary-400" />
            <Heading className="text-white mt-4" size="lg">
              {t("app.settings.contentSettings.title")}
            </Heading>
            <HStack className="items-center gap-x-4 py-4 justify-between flex-1">
              <VStack className="gap-y-2 w-1/2">
                <Heading className="text-white font-normal" size="md">
                  {t("app.settings.contentSettings.recentSearchesLabel")}
                </Heading>
                <Text className="text-primary-100 text-sm">
                  {t("app.settings.contentSettings.recentSearchesDescription")}
                </Text>
              </VStack>
              <FadeOutScaleDown
                onPress={() => setShowRecentSearchesAlertDialog(true)}
                className="flex-1 items-center justify-center py-2 px-8 border border-red-500 bg-red-500 rounded-full"
              >
                <Text
                  numberOfLines={1}
                  className="text-primary-800 font-bold text-lg"
                >
                  {t("app.shared.delete")}
                </Text>
              </FadeOutScaleDown>
            </HStack>
            <HStack className="flex-1 items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-1/2">
                <Heading className="text-white font-normal" size="md">
                  {t("app.settings.contentSettings.recentPlaysLabel")}
                </Heading>
                <Text className="text-primary-100 text-sm">
                  {t("app.settings.contentSettings.recentPlaysDescription")}
                </Text>
              </VStack>
              <FadeOutScaleDown
                onPress={() => setShowRecentPlaysAlertDialog(true)}
                className="flex-1 items-center justify-center py-2 px-8 border border-red-500 bg-red-500 rounded-full"
              >
                <Text
                  numberOfLines={1}
                  className="text-primary-800 font-bold text-lg"
                >
                  {t("app.shared.delete")}
                </Text>
              </FadeOutScaleDown>
            </HStack>
            <HStack className="flex-1 items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-1/2">
                <Heading className="text-white font-normal" size="md">
                  {t("app.settings.contentSettings.activityLabel")}
                </Heading>
                <Text className="text-primary-100 text-sm">
                  {t("app.settings.contentSettings.activityDescription")}
                </Text>
              </VStack>
              <FadeOutScaleDown
                onPress={() => setShowActivityAlertDialog(true)}
                className="flex-1 items-center justify-center py-2 px-8 border border-red-500 bg-red-500 rounded-full"
              >
                <Text
                  numberOfLines={1}
                  className="text-primary-800 font-bold text-lg"
                >
                  {t("app.shared.delete")}
                </Text>
              </FadeOutScaleDown>
            </HStack>
            <Divider className="bg-primary-400" />
            <Heading className="text-white mt-4" size="lg">
              {t("app.settings.backupSettings.title")}
            </Heading>
            <HStack className="flex-1 items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-1/2">
                <Heading className="text-white font-normal" size="md">
                  {t("app.settings.backupSettings.exportLabel")}
                </Heading>
                <Text className="text-primary-100 text-sm">
                  {t("app.settings.backupSettings.exportDescription")}
                </Text>
              </VStack>
              <FadeOutScaleDown
                onPress={handleExportBackupPress}
                className="flex-1 items-center justify-center py-2 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
              >
                <Text
                  numberOfLines={1}
                  className="text-primary-800 font-bold text-lg"
                >
                  {t("app.settings.backupSettings.exportAction")}
                </Text>
              </FadeOutScaleDown>
            </HStack>
            <HStack className="flex-1 items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-1/2">
                <Heading className="text-white font-normal" size="md">
                  {t("app.settings.backupSettings.restoreLabel")}
                </Heading>
                <Text className="text-primary-100 text-sm">
                  {t("app.settings.backupSettings.restoreDescription")}
                </Text>
              </VStack>
              <FadeOutScaleDown
                onPress={() => setShowRestoreConfirmAlertDialog(true)}
                className="flex-1 items-center justify-center py-2 px-8 border border-red-500 bg-red-500 rounded-full"
              >
                <Text
                  numberOfLines={1}
                  className="text-primary-800 font-bold text-lg"
                >
                  {t("app.settings.backupSettings.restoreAction")}
                </Text>
              </FadeOutScaleDown>
            </HStack>
          </VStack>
        </ScrollView>
      </Box>
      <BottomSheetModal
        ref={bottomSheetLanguageModalRef}
        onChange={handleSheetPositionChange}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView
          style={{
            flex: 1,
            alignItems: "center",
          }}
        >
          <Box className="p-6 w-full mb-12">
            <VStack className="mt-6 gap-y-8">
              {SupportedLanguages.map((language) => (
                <FadeOutScaleDown
                  key={language}
                  onPress={() => setLocale(language)}
                >
                  <HStack className="items-center justify-between">
                    <VStack className="ml-4">
                      <Text className="text-lg text-gray-200">
                        {t(`app.shared.languages.${language}`, {
                          lng: language,
                        })}
                      </Text>
                    </VStack>
                    {locale === language && (
                      <Check size={24} color={emerald500} />
                    )}
                  </HStack>
                </FadeOutScaleDown>
              ))}
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
      <BottomSheetModal
        ref={bottomSheetBitRateModalRef}
        onChange={handleBitRateSheetPositionChange}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView
          style={{
            flex: 1,
            alignItems: "center",
          }}
        >
          <Box className="p-6 w-full mb-12">
            <VStack className="mt-6 gap-y-8">
              {bitRateOptions.map((option) => (
                <FadeOutScaleDown
                  key={option ?? "original"}
                  onPress={() => setMaxBitRate(option)}
                >
                  <HStack className="items-center justify-between">
                    <VStack className="ml-4">
                      <Text className="text-lg text-gray-200">
                        {formatBitRate(option)}
                      </Text>
                    </VStack>
                    {maxBitRate === option && (
                      <Check size={24} color={emerald500} />
                    )}
                  </HStack>
                </FadeOutScaleDown>
              ))}
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
      <BottomSheetModal
        ref={bottomSheetCellularBitRateModalRef}
        onChange={handleCellularBitRateSheetPositionChange}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView
          style={{
            flex: 1,
            alignItems: "center",
          }}
        >
          <Box className="p-6 w-full mb-12">
            <VStack className="mt-6 gap-y-8">
              {bitRateOptions.map((option) => (
                <FadeOutScaleDown
                  key={option ?? "original"}
                  onPress={() => setCellularMaxBitRate(option)}
                >
                  <HStack className="items-center justify-between">
                    <VStack className="ml-4">
                      <Text className="text-lg text-gray-200">
                        {formatBitRate(option)}
                      </Text>
                    </VStack>
                    {cellularMaxBitRate === option && (
                      <Check size={24} color={emerald500} />
                    )}
                  </HStack>
                </FadeOutScaleDown>
              ))}
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
      <BottomSheetModal
        ref={bottomSheetReplayGainModalRef}
        onChange={handleReplayGainSheetPositionChange}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView
          style={{
            flex: 1,
            alignItems: "center",
          }}
        >
          <Box className="p-6 w-full mb-12">
            <VStack className="mt-6 gap-y-8">
              {replayGainOptions.map((option) => (
                <FadeOutScaleDown
                  key={option}
                  onPress={() => setReplayGainMode(option)}
                >
                  <HStack className="items-center justify-between">
                    <VStack className="ml-4">
                      <Text className="text-lg text-gray-200">
                        {t(
                          `app.settings.streamingSettings.replayGainModes.${option}`,
                        )}
                      </Text>
                    </VStack>
                    {replayGainMode === option && (
                      <Check size={24} color={emerald500} />
                    )}
                  </HStack>
                </FadeOutScaleDown>
              ))}
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
      <BottomSheetModal
        ref={bottomSheetQueueSyncModalRef}
        onChange={handleQueueSyncSheetPositionChange}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView
          style={{
            flex: 1,
            alignItems: "center",
          }}
        >
          <Box className="p-6 w-full mb-12">
            <VStack className="gap-y-2">
              <Heading className="text-white font-bold" size="md">
                {t("app.settings.playbackSettings.queueSyncLabel")}
              </Heading>
              <Text className="text-primary-100 text-sm">
                {t("app.settings.playbackSettings.queueSyncDescription")}
              </Text>
            </VStack>
            <VStack className="mt-6 gap-y-8">
              {queueSyncOptions.map((option) => (
                <FadeOutScaleDown
                  key={option}
                  onPress={() => {
                    setQueueSyncPriority(option);
                    bottomSheetQueueSyncModalRef.current?.dismiss();
                  }}
                >
                  <HStack className="items-center justify-between gap-x-4">
                    <VStack className="ml-4 flex-1 gap-y-1">
                      <Text className="text-lg text-gray-200">
                        {t(
                          `app.settings.playbackSettings.queueSyncOptions.${option}.label`,
                        )}
                      </Text>
                      <Text className="text-primary-100 text-sm">
                        {t(
                          `app.settings.playbackSettings.queueSyncOptions.${option}.description`,
                        )}
                      </Text>
                    </VStack>
                    {queueSyncPriority === option && (
                      <Check size={24} color={emerald500} />
                    )}
                  </HStack>
                </FadeOutScaleDown>
              ))}
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
      <AlertDialog
        isOpen={showClearCacheAlertDialog}
        onClose={handleCloseClearCacheAlertDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.settings.cacheSettings.confirmTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t("app.settings.cacheSettings.confirmDescription")}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCloseClearCacheAlertDialog}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleClearCachePress}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.clear")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        isOpen={showRecentPlaysAlertDialog}
        onClose={handleCloseRecentPlaysAlertDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.settings.contentSettings.recentPlaysConfirmTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t("app.settings.contentSettings.recentPlaysConfirmDescription")}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCloseRecentPlaysAlertDialog}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleDeleteRecentPlaysPress}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.delete")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        isOpen={showRecentSearchesAlertDialog}
        onClose={handleCloseRecentSearchesAlertDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.settings.contentSettings.recentSearchesConfirmTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t(
                "app.settings.contentSettings.recentSearchesConfirmDescription",
              )}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCloseRecentSearchesAlertDialog}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleDeleteRecentSearchesPress}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.delete")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        isOpen={showActivityAlertDialog}
        onClose={handleCloseActivityAlertDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.settings.contentSettings.activityConfirmTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t("app.settings.contentSettings.activityConfirmDescription")}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCloseActivityAlertDialog}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleDeleteActivityPress}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.delete")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        isOpen={showPodcastsAlertDialog}
        onClose={handleClosePodcastsAlertDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <KeyboardAvoidingView
          behavior="padding"
          style={{ width: "100%", alignItems: "center" }}
        >
          <AlertDialogContent className="bg-primary-800 border-primary-400">
            <AlertDialogHeader>
              <Heading className="text-white font-bold" size="md">
                {t("app.settings.podcastSettings.podcastConfigFormTitle")}
              </Heading>
            </AlertDialogHeader>
            <AlertDialogBody
              className="mt-3 mb-4"
              showsVerticalScrollIndicator={false}
            >
              <Text className="text-primary-50" size="sm">
                {t("app.settings.podcastSettings.podcastConfigFormDescription")}
              </Text>
              <podcastConfigForm.Field name="userId">
                {(field) => (
                  <FormControl
                    isInvalid={showFieldError(field)}
                    size="md"
                    isDisabled={false}
                    isReadOnly={false}
                    isRequired={false}
                    className="my-4"
                  >
                    <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                      <InputField
                        value={field.state.value}
                        onChangeText={field.handleChange}
                        onBlur={() => handleFieldBlur(field)}
                        className="text-md text-white"
                        placeholder={t(
                          "app.settings.podcastSettings.userIdPlaceholder",
                        )}
                        autoCapitalize="none"
                        keyboardType="numeric"
                      />
                    </Input>
                    <FieldError field={field} />
                  </FormControl>
                )}
              </podcastConfigForm.Field>
              <podcastConfigForm.Field name="apiKey">
                {(field) => (
                  <FormControl
                    isInvalid={showFieldError(field)}
                    size="md"
                    isDisabled={false}
                    isReadOnly={false}
                    isRequired={false}
                    className="my-4"
                  >
                    <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                      <InputField
                        value={field.state.value}
                        onChangeText={field.handleChange}
                        onBlur={() => handleFieldBlur(field)}
                        className="text-md text-white"
                        placeholder={t(
                          "app.settings.podcastSettings.apiKeyPlaceholder",
                        )}
                        autoCapitalize="none"
                        secureTextEntry
                      />
                    </Input>
                    <FieldError field={field} />
                  </FormControl>
                )}
              </podcastConfigForm.Field>
              <podcastConfigForm.Field name="country">
                {(field) => (
                  <FormControl
                    isInvalid={showFieldError(field)}
                    size="md"
                    isDisabled={false}
                    isReadOnly={false}
                    isRequired={false}
                    className="my-4"
                  >
                    <Select
                      selectedValue={taddyPodcastCountry}
                      onValueChange={(value) =>
                        field.handleChange(value as keyof typeof Country)
                      }
                      onClose={() => handleFieldBlur(field)}
                      closeOnOverlayClick
                      isInvalid={showFieldError(field)}
                    >
                      <SelectTrigger className="bg-primary-600 border border-primary-600 rounded-md px-6 py-3 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500">
                        <SelectInput
                          className="flex-1 text-md text-white"
                          placeholder={t(
                            "app.settings.podcastSettings.countryPlaceholder",
                          )}
                        />
                        <SelectIcon className="mr-3" as={ChevronDownIcon} />
                      </SelectTrigger>
                      <SelectPortal snapPoints={[75]}>
                        <SelectBackdrop />
                        <SelectContent
                          style={{ backgroundColor: "rgb(41, 41, 41)" }}
                        >
                          <SelectDragIndicatorWrapper>
                            <SelectDragIndicator />
                          </SelectDragIndicatorWrapper>
                          <SelectFlatList
                            data={Object.values(Country)}
                            keyExtractor={(item) => item as string}
                            renderItem={({ item }) => (
                              <SelectItem
                                label={item as string}
                                value={item as string}
                                textStyle={{
                                  className: "text-white",
                                }}
                              />
                            )}
                          />
                        </SelectContent>
                      </SelectPortal>
                    </Select>
                    <FieldError field={field} />
                  </FormControl>
                )}
              </podcastConfigForm.Field>
              <podcastConfigForm.Field name="language">
                {(field) => (
                  <FormControl
                    isInvalid={showFieldError(field)}
                    size="md"
                    isDisabled={false}
                    isReadOnly={false}
                    isRequired={false}
                    className="my-4"
                  >
                    <Select
                      selectedValue={taddyPodcastLanguage}
                      onValueChange={(value) =>
                        field.handleChange(value as keyof typeof Language)
                      }
                      onClose={() => handleFieldBlur(field)}
                      closeOnOverlayClick
                      isInvalid={showFieldError(field)}
                    >
                      <SelectTrigger className="bg-primary-600 border border-primary-600 rounded-md px-6 py-3 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500">
                        <SelectInput
                          className="flex-1 text-md text-white"
                          placeholder={t(
                            "app.settings.podcastSettings.languagePlaceholder",
                          )}
                        />
                        <SelectIcon className="mr-3" as={ChevronDownIcon} />
                      </SelectTrigger>
                      <SelectPortal snapPoints={[75]}>
                        <SelectBackdrop />
                        <SelectContent
                          style={{ backgroundColor: "rgb(41, 41, 41)" }}
                        >
                          <SelectDragIndicatorWrapper>
                            <SelectDragIndicator />
                          </SelectDragIndicatorWrapper>
                          <SelectFlatList
                            data={Object.values(Language)}
                            keyExtractor={(item) => item as string}
                            renderItem={({ item }) => (
                              <SelectItem
                                label={item as string}
                                value={item as string}
                                textStyle={{
                                  className: "text-white",
                                }}
                              />
                            )}
                          />
                        </SelectContent>
                      </SelectPortal>
                    </Select>
                    <FieldError field={field} />
                  </FormControl>
                )}
              </podcastConfigForm.Field>
            </AlertDialogBody>
            <AlertDialogFooter className="items-center justify-center">
              <FadeOutScaleDown
                onPress={handleClosePodcastsAlertDialog}
                className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
              >
                <Text className="text-white font-bold text-lg">
                  {t("app.shared.cancel")}
                </Text>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() => {
                  isPodcastConfigDirty
                    ? podcastConfigForm.handleSubmit()
                    : undefined;
                }}
                className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
              >
                <Text className="text-primary-800 font-bold text-lg">
                  {t("app.shared.save")}
                </Text>
              </FadeOutScaleDown>
            </AlertDialogFooter>
          </AlertDialogContent>
        </KeyboardAvoidingView>
      </AlertDialog>
      <AlertDialog
        isOpen={showDeletePodcastsAlertDialog}
        onClose={handleCloseDeletePodcastsAlertDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t(
                "app.settings.podcastSettings.removePodcastConfigConfirmLabel",
              )}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t(
                "app.settings.podcastSettings.removePodcastConfigConfirmDescription",
              )}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCloseDeletePodcastsAlertDialog}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleDeletePodcastsConfigPress}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.delete")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        isOpen={showRestoreConfirmAlertDialog}
        onClose={handleCloseRestoreConfirmAlertDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.settings.backupSettings.restoreConfirmTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t("app.settings.backupSettings.restoreConfirmDescription")}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCloseRestoreConfirmAlertDialog}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleConfirmRestoreBackupPress}
              className="items-center justify-center py-3 px-8 border border-red-500 bg-red-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.settings.backupSettings.restoreAction")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        isOpen={showRestartRequiredAlertDialog}
        onClose={() => setShowRestartRequiredAlertDialog(false)}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.settings.backupSettings.restartRequiredTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t("app.settings.backupSettings.restartRequiredDescription")}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleFinishRestore}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.settings.backupSettings.restartRequiredAction")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}
