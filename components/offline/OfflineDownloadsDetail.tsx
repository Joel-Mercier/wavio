import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import Trash2 from "lucide-react-native/dist/esm/icons/trash-2.mjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import OfflineDownloadItem from "@/components/offline/OfflineDownloadItem";
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
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import {
  useDownloadedTracksList,
  useOfflineDownloads,
  useTotalDownloadSize,
} from "@/hooks/useOfflineDownloads";
import { niceBytes } from "@/utils/fileSize";

export default function OfflineDownloadsDetail() {
  const [gray500, white] = Uniwind.getCSSVariable([
    "--color-gray-500",
    "--color-white",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const { removeDownloadedTrack, clearAllDownloads } = useOfflineDownloads();
  const downloadedTracksList = useDownloadedTracksList();
  const totalDownloadSize = useTotalDownloadSize();

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const isEmpty = downloadedTracksList.length === 0;

  const handleClearAllPress = async () => {
    setShowClearConfirm(false);
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
    } catch {
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

  const handleRemovePress = async (trackId: string) => {
    try {
      await removeDownloadedTrack(trackId);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.tracks.removeOfflineDownloadSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    } catch {
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.tracks.removeOfflineDownloadErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  const iconActiveColor = white;
  const iconDisabledColor = gray500;

  return (
    <Box className="h-full">
      <Box className="mt-6 pb-6 flex-1">
        <HStack
          className="items-center mb-4 px-6"
          style={{ paddingTop: insets.top }}
        >
          <FadeOutScaleDown onPress={() => router.back()}>
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <Heading
            className="text-white text-center truncate flex-1 mx-2"
            size="lg"
            numberOfLines={1}
          >
            {t("app.offlineDownloads.title")}
          </Heading>
          <Box className="w-6" />
        </HStack>
        <HStack className="items-center justify-between px-6 mb-4">
          <VStack>
            <Text className="text-white font-bold">
              {t("app.offlineDownloads.totalTracks", {
                count: downloadedTracksList.length,
              })}
            </Text>
            <Text className="text-primary-100 text-sm">
              {t("app.offlineDownloads.totalSize", {
                size: niceBytes(totalDownloadSize),
              })}
            </Text>
          </VStack>
          <FadeOutScaleDown
            onPress={isEmpty ? undefined : () => setShowClearConfirm(true)}
          >
            <HStack className="items-center gap-x-2">
              <Trash2
                size={16}
                color={isEmpty ? iconDisabledColor : iconActiveColor}
              />
              <Text className="text-white font-bold">
                {t("app.offlineDownloads.clearAll")}
              </Text>
            </HStack>
          </FadeOutScaleDown>
        </HStack>
        <Box className="px-6 flex-1">
          {isEmpty ? (
            <VStack className="flex-1 items-center justify-center">
              <Text className="text-primary-100 text-center">
                {t("app.offlineDownloads.empty")}
              </Text>
            </VStack>
          ) : (
            <FlashList
              data={downloadedTracksList}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingBottom:
                  insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
              }}
              renderItem={({ item }) => (
                <OfflineDownloadItem
                  item={item}
                  onRemovePress={() => handleRemovePress(item.id)}
                />
              )}
            />
          )}
        </Box>
      </Box>
      <AlertDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.settings.offlineSettings.clearDownloadsConfirmTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t(
                "app.settings.offlineSettings.clearDownloadsConfirmDescription",
              )}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={() => setShowClearConfirm(false)}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleClearAllPress}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.delete")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}
