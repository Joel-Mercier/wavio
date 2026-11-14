import Undo2 from "lucide-react-native/icons/undo-2";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { TOAST_DURATION } from "@/utils/toastDuration";

let undoToastId: string | null = null;

// Hiding is reversible from the sheet, but the queue copies it removed are not:
// the undo here is the only way to get them back where they were.
export function useHiddenTracksToast() {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  const toast = useToast();

  return useCallback(
    (description: string, onUndo?: () => void) => {
      if (undoToastId) toast.close(undoToastId);
      undoToastId = toast.show({
        placement: "top",
        duration: onUndo ? TOAST_DURATION.long : TOAST_DURATION.default,
        render: ({ id }) => (
          <Toast action="success">
            <HStack className="items-center gap-x-6">
              <VStack className="shrink">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription numberOfLines={2}>
                  {description}
                </ToastDescription>
              </VStack>
              {onUndo && (
                <FadeOutScaleDown
                  testID="hidden-tracks-undo-button"
                  onPress={() => {
                    toast.close(id);
                    if (undoToastId === id) undoToastId = null;
                    onUndo();
                  }}
                >
                  <HStack className="items-center gap-x-2">
                    <Undo2 size={20} color={white} />
                    <Text className="text-white font-bold">
                      {t("app.queue.undo")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
            </HStack>
          </Toast>
        ),
      });
    },
    [toast, t, white],
  );
}
