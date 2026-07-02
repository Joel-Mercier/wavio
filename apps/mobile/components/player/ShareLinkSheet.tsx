import {
  BottomSheetBackdrop,
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import * as Clipboard from "expo-clipboard";
import ClipboardIcon from "lucide-react-native/dist/esm/icons/clipboard.mjs";
import ClipboardCheck from "lucide-react-native/dist/esm/icons/clipboard-check.mjs";
import { type RefObject, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import BottomSheetModalComponent from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { logError } from "@/utils/log";

export default function ShareLinkSheet({
  sheetRef,
  url,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  url: string;
}) {
  const [emerald500, gray200] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-gray-200",
  ]) as string[];
  const { t } = useTranslation();
  const toast = useToast();
  const [copyDone, setCopyDone] = useState(false);
  const { handleSheetPositionChange } = useBottomSheetBackHandler(sheetRef);

  useEffect(() => {
    if (copyDone) {
      const timer = setTimeout(() => {
        setCopyDone(false);
      }, 1000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [copyDone]);

  const handleCopyPress = async () => {
    try {
      if (url) {
        await Clipboard.setStringAsync(url);
        setCopyDone(true);
        toast.show({
          placement: "top",
          duration: 3000,
          render: () => (
            <Toast action="success">
              <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
              <ToastDescription>
                {t("app.shared.shareUrlCopiedMessage")}
              </ToastDescription>
            </Toast>
          ),
        });
      }
    } catch (e) {
      logError(e);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.shared.shareUrlErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  return (
    <BottomSheetModalComponent
      ref={sheetRef}
      onChange={handleSheetPositionChange}
      backgroundStyle={{
        backgroundColor: "rgb(41, 41, 41)",
      }}
      handleIndicatorStyle={{
        backgroundColor: "#b3b3b3",
      }}
      backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
    >
      <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
        <Box className="p-6 w-full mb-12">
          <HStack className="items-center">
            <FadeOutScaleDown
              className="flex-row gap-x-4 items-center justify-between flex-1  overflow-hidden"
              onPress={handleCopyPress}
            >
              {copyDone ? (
                <ClipboardCheck size={24} color={emerald500} />
              ) : (
                <ClipboardIcon size={24} color={gray200} />
              )}
              <Text
                className="text-lg text-gray-200 py-1 px-3 bg-primary-900 rounded-xl  flex-1 grow"
                ellipsizeMode="tail"
                numberOfLines={1}
              >
                {url}
              </Text>
            </FadeOutScaleDown>
          </HStack>
        </Box>
      </BottomSheetScrollView>
    </BottomSheetModalComponent>
  );
}
