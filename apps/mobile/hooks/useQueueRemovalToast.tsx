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
import useQueue, { type QueueTrack } from "@/stores/queue";
import { TOAST_DURATION } from "@/utils/toastDuration";

export type RemovedQueueEntry = { track: QueueTrack; index: number };

// Only the latest removal is undoable, whichever screen it came from: a stack of
// undo toasts would leave the user guessing which one brings back which track.
let undoToastId: string | null = null;

export function useQueueRemovalToast() {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  const toast = useToast();

  return useCallback(
    (removed: RemovedQueueEntry[]) => {
      if (removed.length === 0) return;
      // Ascending, so each copy goes back into the slot it had before the ones
      // after it are reinserted.
      const entries = [...removed].sort((a, b) => a.index - b.index);
      if (undoToastId) toast.close(undoToastId);
      undoToastId = toast.show({
        placement: "top",
        duration: TOAST_DURATION.long,
        render: ({ id }) => (
          <Toast action="success">
            <HStack className="items-center gap-x-6">
              <VStack className="shrink">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription numberOfLines={1}>
                  {t("app.queue.removedTrackFromQueueMessage", {
                    title: entries[0].track.title ?? "",
                  })}
                </ToastDescription>
              </VStack>
              <FadeOutScaleDown
                testID="queue-undo-remove-button"
                onPress={() => {
                  toast.close(id);
                  if (undoToastId === id) undoToastId = null;
                  const { restoreAt } = useQueue.getState();
                  for (const { track, index } of entries) {
                    restoreAt(track, index);
                  }
                }}
              >
                <HStack className="items-center gap-x-2">
                  <Undo2 size={20} color={white} />
                  <Text className="text-white font-bold">
                    {t("app.queue.undo")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            </HStack>
          </Toast>
        ),
      });
    },
    [toast, t, white],
  );
}
