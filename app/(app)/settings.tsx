import FadeOutScaleDown from "@/components/FadeOutScaleDown";
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
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { SupportedLanguages } from "@/config/i18n";
import { themeConfig } from "@/config/theme";
import {
  useGetScanStatus,
  useStartScan,
} from "@/hooks/openSubsonic/useMediaLibraryScanning";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useApp from "@/stores/app";
import useRecentPlays from "@/stores/recentPlays";
import useRecentSearches from "@/stores/recentSearches";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { formatDistanceToNow, parse, parseISO } from "date-fns";
import { useRouter } from "expo-router";
import { ArrowLeft, Check } from "lucide-react-native";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export default function SettingsScreen() {
  const { t } = useTranslation();
  const [showRecentPlaysAlertDialog, setShowRecentPlaysAlertDialog] =
    useState(false);
  const [showRecentSearchesAlertDialog, setShowRecentSearchesAlertDialog] =
    useState(false);
  const bottomSheetLanguageModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } = useBottomSheetBackHandler(
    bottomSheetLanguageModalRef,
  );
  const router = useRouter();
  const toast = useToast();
  const locale = useApp.use.locale();
  const setLocale = useApp.use.setLocale();
  const showAddTab = useApp.use.showAddTab();
  const setShowAddTab = useApp.use.setShowAddTab();
  const clearRecentPlays = useRecentPlays.use.clearRecentPlays();
  const clearRecentSearches = useRecentSearches.use.clearRecentSearches();
  const doStartScan = useStartScan();
  const { data, isLoading, error } = useGetScanStatus();

  const handlePresentLanguageModalPress = () => {
    bottomSheetLanguageModalRef.current?.present();
  };

  const handleCloseRecentPlaysAlertDialog = () => {
    setShowRecentPlaysAlertDialog(false);
  };

  const handleCloseRecentSearchesAlertDialog = () => {
    setShowRecentSearchesAlertDialog(false);
  };

  const handleDeleteRecentPlaysPress = () => {
    clearRecentPlays();
    setShowRecentPlaysAlertDialog(false);
  };

  const handleDeleteRecentSearchesPress = () => {
    clearRecentSearches();
    setShowRecentSearchesAlertDialog(false);
  };

  console.log("DATA", data);

  const handleMediaLibraryScanPress = () => {
    doStartScan.mutate(undefined, {
      onSuccess: () => {
        toast.show({
          placement: "top",
          duration: 3000,
          render: () => (
            <Toast action="success">
              <ToastDescription>Scan started successfully</ToastDescription>
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
              <ToastDescription>
                An error occurred while starting a scan
              </ToastDescription>
            </Toast>
          ),
        });
      },
    });
  };

  return (
    <SafeAreaView>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Box className="px-6 mt-6 mb-4">
          <HStack className="items-center">
            <FadeOutScaleDown onPress={() => router.back()}>
              <ArrowLeft size={24} color="white" />
            </FadeOutScaleDown>
            <Heading className="text-white ml-4" size="xl">
              Settings
            </Heading>
          </HStack>
          <VStack className="my-6 gap-y-4">
            <Heading className="text-white mt-4" size="lg">
              Music library settings
            </Heading>
            <HStack className="items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-3/5">
                <Heading className="text-white font-normal" size="md">
                  Scan music library
                </Heading>
                <Text className="text-primary-100 text-sm">
                  Initiates a rescan of the media libraries on your server
                </Text>
              </VStack>
              <FadeOutScaleDown
                onPress={handleMediaLibraryScanPress}
                className="items-center justify-center py-2 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
              >
                <Text className="text-primary-800 font-bold text-lg">Scan</Text>
              </FadeOutScaleDown>
            </HStack>
            <HStack className="items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-3/5">
                <Heading className="text-white font-normal" size="md">
                  Scan status
                </Heading>
                <Text className="text-primary-100 text-sm">
                  Indicates the scan status of your music library
                </Text>
                {data?.scanStatus?.lastScan && (
                  <Text className="text-primary-100 text-sm">
                    {`Last scan: ${formatDistanceToNow(
                      parseISO(data?.scanStatus?.lastScan || ""),
                    )} ago`}
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
                  {data?.scanStatus?.scanning ? "Scanning" : "Idle"}
                </BadgeText>
              </Badge>
            </HStack>
            <Divider className="bg-primary-400" />
            <Heading className="text-white mt-4" size="lg">
              Display settings
            </Heading>
            <FadeOutScaleDown onPress={handlePresentLanguageModalPress}>
              <HStack className="items-center gap-x-4 py-4">
                <VStack className="gap-y-2">
                  <Heading className="text-white font-normal" size="md">
                    Language
                  </Heading>
                  <Text className="text-primary-100 text-sm">
                    Set your default language for the Wavio app
                  </Text>
                </VStack>
              </HStack>
            </FadeOutScaleDown>
            <HStack className="items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-3/5">
                <Heading className="text-white font-normal" size="md">
                  Create tab
                </Heading>
                <Text className="text-primary-100 text-sm">
                  Show the create tab in the bottom tabs
                </Text>
              </VStack>
              <Switch
                size="md"
                trackColor={{
                  false: themeConfig.theme.colors.primary[400],
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
              Content settings
            </Heading>
            <HStack className="items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-3/5">
                <Heading className="text-white font-normal" size="md">
                  Recent searches
                </Heading>
                <Text className="text-primary-100 text-sm">
                  Delete your recent searches
                </Text>
              </VStack>
              <FadeOutScaleDown
                onPress={() => setShowRecentSearchesAlertDialog(true)}
                className="items-center justify-center py-2 px-8 border border-red-500 bg-red-500 rounded-full"
              >
                <Text className="text-primary-800 font-bold text-lg">
                  Delete
                </Text>
              </FadeOutScaleDown>
            </HStack>
            <HStack className="items-center gap-x-4 py-4 justify-between">
              <VStack className="gap-y-2 w-3/5">
                <Heading className="text-white font-normal" size="md">
                  Recent plays
                </Heading>
                <Text className="text-primary-100 text-sm">
                  Delete your recent plays shortcuts on the top of the home
                  screen
                </Text>
              </VStack>
              <FadeOutScaleDown
                onPress={() => setShowRecentPlaysAlertDialog(true)}
                className="items-center justify-center py-2 px-8 border border-red-500 bg-red-500 rounded-full"
              >
                <Text className="text-primary-800 font-bold text-lg">
                  Delete
                </Text>
              </FadeOutScaleDown>
            </HStack>
          </VStack>
        </Box>
      </ScrollView>
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
                        {t(`app.settings.form.language.options.${language}`, {
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
              Are you sure you want to delete your stored recent play shortcuts
              ?
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              Deleting these is irreversible. Please confirm if you want to
              proceed.
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCloseRecentPlaysAlertDialog}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">Cancel</Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleDeleteRecentPlaysPress}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">Delete</Text>
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
              Are you sure you want to delete your stored recent searches ?
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              Deleting these is irreversible. Please confirm if you want to
              proceed.
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCloseRecentSearchesAlertDialog}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">Cancel</Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleDeleteRecentSearchesPress}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">Delete</Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SafeAreaView>
  );
}
