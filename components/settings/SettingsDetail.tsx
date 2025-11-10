import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
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
import {
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
} from "@/components/ui/form-control";
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
import { themeConfig } from "@/config/theme";
import {
  useGetScanStatus,
  useStartScan,
} from "@/hooks/openSubsonic/useMediaLibraryScanning";
import { useRemainingApiRequests } from "@/hooks/taddyPodcasts/useSystem";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { useOfflineDownloads } from "@/hooks/useOfflineDownloads";
import { Country, Language } from "@/services/taddyPodcasts/types";
import useApp from "@/stores/app";
import usePodcasts from "@/stores/podcasts";
import useRecentPlays from "@/stores/recentPlays";
import useRecentSearches from "@/stores/recentSearches";
import { formatDistanceToNow } from "@/utils/date";
import { niceBytes } from "@/utils/fileSize";
import { cn } from "@/utils/tailwind";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { useRouter } from "expo-router";
import {
  AlertCircleIcon,
  ArrowLeft,
  Check,
  ChevronDownIcon,
} from "lucide-react-native";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import z from "zod";
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
  const { t, i18n } = useTranslation();
  const [showRecentPlaysAlertDialog, setShowRecentPlaysAlertDialog] =
    useState(false);
  const [showRecentSearchesAlertDialog, setShowRecentSearchesAlertDialog] =
    useState(false);
  const [showPodcastsAlertDialog, setShowPodcastsAlertDialog] = useState(false);
  const [showDeletePodcastsAlertDialog, setShowDeletePodcastsAlertDialog] =
    useState(false);
  const bottomSheetLanguageModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } = useBottomSheetBackHandler(
    bottomSheetLanguageModalRef,
  );
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const toast = useToast();
  const locale = useApp((store) => store.locale);
  const setLocale = useApp((store) => store.setLocale);
  const showAddTab = useApp((store) => store.showAddTab);
  const setShowAddTab = useApp((store) => store.setShowAddTab);
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
  const doStartScan = useStartScan();
  const { data, isLoading, error } = useGetScanStatus();
  const { data: remainingApiRequests } = useRemainingApiRequests(
    !!(taddyPodcastApiKey && taddyPodcastUserId),
  );

  const {
    offlineModeEnabled,
    setOfflineModeEnabled,
    getDownloadedTracksCount,
    getTotalDownloadSize,
    clearAllDownloads,
    downloadedTracksList,
  } = useOfflineDownloads();
  const podcastConfigForm = useForm({
    defaultValues: {
      apiKey: taddyPodcastApiKey,
      userId: taddyPodcastUserId,
      language: taddyPodcastLanguage,
      country: taddyPodcastCountry,
    },
    validators: {
      onBlur: podcastConfigSchema,
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

  const handlePresentLanguageModalPress = () => {
    bottomSheetLanguageModalRef.current?.present();
  };

  const handleCloseRecentPlaysAlertDialog = () => {
    setShowRecentPlaysAlertDialog(false);
  };

  const handleCloseRecentSearchesAlertDialog = () => {
    setShowRecentSearchesAlertDialog(false);
  };

  const handleCloseDeletePodcastsAlertDialog = () => {
    setShowDeletePodcastsAlertDialog(false);
  };

  const handleDeleteRecentPlaysPress = () => {
    clearRecentPlays();
    setShowRecentPlaysAlertDialog(false);
  };

  const handleDeleteRecentSearchesPress = () => {
    clearRecentSearches();
    setShowRecentSearchesAlertDialog(false);
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
        console.error(error);
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

  const handleClearOfflineDownloadsPress = async () => {
    try {
      await clearAllDownloads();
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.settings.offlineSettings.clearDownloadsSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    } catch (error) {
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.settings.offlineSettings.clearDownloadsErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  const handleConfigurePodcastsPress = () => {
    setShowPodcastsAlertDialog(true);
  };

  const handleClosePodcastsAlertDialog = () => {
    setShowPodcastsAlertDialog(false);
  };

  return (
    <Box className="h-full">
      <Box className="px-6 mt-6 pb-6">
        <HStack
          className="items-center mb-6"
          style={{ paddingTop: insets.top }}
        >
          <FadeOutScaleDown onPress={() => router.back()}>
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <Heading className="text-white ml-4" size="xl">
            {t("app.settings.title")}
          </Heading>
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
                      count: getDownloadedTracksCount(),
                      total: downloadedTracksList.length,
                      size: niceBytes(getTotalDownloadSize()),
                    })}
                  </Text>
                )}
              </VStack>
              <Switch
                size="md"
                trackColor={{
                  false: themeConfig.theme.colors.gray[500],
                  true: themeConfig.theme.colors.emerald[500],
                }}
                thumbColor={themeConfig.theme.colors.white}
                ios_backgroundColor={themeConfig.theme.colors.white}
                value={offlineModeEnabled}
                onToggle={(value) => setOfflineModeEnabled(value)}
              />
            </HStack>
            {offlineModeEnabled && (
              <HStack className="items-center gap-x-4 py-4 justify-between">
                <VStack className="gap-y-2 w-3/5">
                  <Heading className="text-white font-normal" size="md">
                    {t("app.settings.offlineSettings.clearDownloadsLabel")}
                  </Heading>
                  <Text className="text-primary-100 text-sm">
                    {t(
                      "app.settings.offlineSettings.clearDownloadsDescription",
                    )}
                  </Text>
                </VStack>
                <FadeOutScaleDown
                  onPress={handleClearOfflineDownloadsPress}
                  className="flex-1 items-center justify-center py-2 px-8 border border-red-500 bg-red-500 rounded-full"
                >
                  <Text
                    numberOfLines={1}
                    className="text-primary-800 font-bold text-lg"
                  >
                    {t("app.shared.clear")}
                  </Text>
                </FadeOutScaleDown>
              </HStack>
            )}
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
                    onPress={() => clearTaddyPodcastsConfig()}
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
                    {`${t("app.settings.podcastSettings.apiKey")}: ${taddyPodcastApiKey}`}
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
                  false: themeConfig.theme.colors.gray[500],
                  true: themeConfig.theme.colors.emerald[500],
                }}
                thumbColor={themeConfig.theme.colors.white}
                ios_backgroundColor={themeConfig.theme.colors.white}
                value={showAddTab}
                onToggle={(value) => setShowAddTab(value)}
              />
            </HStack>
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
                      <Check
                        size={24}
                        color={themeConfig.theme.colors.emerald[500]}
                      />
                    )}
                  </HStack>
                </FadeOutScaleDown>
              ))}
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
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
        isOpen={showPodcastsAlertDialog}
        onClose={handleClosePodcastsAlertDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.settings.podcastSettings.podcastConfigFormTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t("app.settings.podcastSettings.podcastConfigFormDescription")}
            </Text>
            <podcastConfigForm.Field name="userId">
              {(field) => (
                <FormControl
                  isInvalid={!field.state.meta.isValid}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Input
                    className="bg-primary-600 border-0 rounded-full"
                    variant="rounded"
                    size="xl"
                  >
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={field.handleBlur}
                      className={cn(
                        "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-full",
                        {
                          "border-red-500": !field.state.meta.isValid,
                        },
                      )}
                      placeholder={t(
                        "app.settings.podcastSettings.userIdPlaceholder",
                      )}
                      autoCapitalize="none"
                      keyboardType="numeric"
                    />
                  </Input>
                  {!field.state.meta.isValid && (
                    <FormControlError className="items-start">
                      <FormControlErrorIcon
                        as={AlertCircleIcon}
                        className="text-red-500"
                      />
                      <FormControlErrorText className="text-red-500 shrink">
                        {field.state.meta.errors
                          .map((error) => error.message)
                          .join("\n")}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>
              )}
            </podcastConfigForm.Field>
            <podcastConfigForm.Field name="apiKey">
              {(field) => (
                <FormControl
                  isInvalid={!field.state.meta.isValid}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Input
                    className="bg-primary-600 border-0 rounded-full"
                    variant="rounded"
                    size="xl"
                  >
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={field.handleBlur}
                      className={cn(
                        "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-full",
                        {
                          "border-red-500": !field.state.meta.isValid,
                        },
                      )}
                      placeholder={t(
                        "app.settings.podcastSettings.userIdPlaceholder",
                      )}
                      autoCapitalize="none"
                    />
                  </Input>
                  {!field.state.meta.isValid && (
                    <FormControlError className="items-start">
                      <FormControlErrorIcon
                        as={AlertCircleIcon}
                        className="text-red-500"
                      />
                      <FormControlErrorText className="text-red-500 shrink">
                        {field.state.meta.errors
                          .map((error) => error.message)
                          .join("\n")}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>
              )}
            </podcastConfigForm.Field>
            <podcastConfigForm.Field name="country">
              {(field) => (
                <FormControl
                  isInvalid={!field.state.meta.isValid}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Select
                    selectedValue={taddyPodcastCountry}
                    onValueChange={(value: keyof typeof Country) =>
                      field.handleChange(value)
                    }
                    onClose={field.handleBlur}
                    closeOnOverlayClick
                    isInvalid={!field.state.meta.isValid}
                  >
                    <SelectTrigger
                      variant="rounded"
                      size="xl"
                      className="bg-primary-600 border-0 rounded-full"
                    >
                      <SelectInput
                        className={cn(
                          "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-full flex-1 pl-4",
                          {
                            "border-red-500": !field.state.meta.isValid,
                          },
                        )}
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
                          keyExtractor={(item) => item}
                          renderItem={({ item }: { item: string }) => (
                            <SelectItem
                              label={item}
                              value={item}
                              textStyle={{
                                className: "text-white",
                              }}
                            />
                          )}
                        />
                      </SelectContent>
                    </SelectPortal>
                  </Select>
                  {!field.state.meta.isValid && (
                    <FormControlError className="items-start">
                      <FormControlErrorIcon
                        as={AlertCircleIcon}
                        className="text-red-500"
                      />
                      <FormControlErrorText className="text-red-500 shrink">
                        {field.state.meta.errors
                          .map((error) => error.message)
                          .join("\n")}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>
              )}
            </podcastConfigForm.Field>
            <podcastConfigForm.Field name="language">
              {(field) => (
                <FormControl
                  isInvalid={!field.state.meta.isValid}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Select
                    selectedValue={taddyPodcastLanguage}
                    onValueChange={(value: keyof typeof Language) =>
                      field.handleChange(value)
                    }
                    onClose={field.handleBlur}
                    closeOnOverlayClick
                    isInvalid={!field.state.meta.isValid}
                  >
                    <SelectTrigger
                      variant="rounded"
                      size="xl"
                      className="bg-primary-600 border-0 rounded-full"
                    >
                      <SelectInput
                        className={cn(
                          "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-full flex-1 pl-4",
                          {
                            "border-red-500": !field.state.meta.isValid,
                          },
                        )}
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
                          data={Object.values(Language)}
                          keyExtractor={(item) => item}
                          renderItem={({ item }: { item: string }) => (
                            <SelectItem
                              label={item}
                              value={item}
                              textStyle={{
                                className: "text-white",
                              }}
                            />
                          )}
                        />
                      </SelectContent>
                    </SelectPortal>
                  </Select>
                  {!field.state.meta.isValid && (
                    <FormControlError className="items-start">
                      <FormControlErrorIcon
                        as={AlertCircleIcon}
                        className="text-red-500"
                      />
                      <FormControlErrorText className="text-red-500 shrink">
                        {field.state.meta.errors
                          .map((error) => error.message)
                          .join("\n")}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
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
                podcastConfigForm.state.isDirty
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
      </AlertDialog>
    </Box>
  );
}
