import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import RefreshCw from "lucide-react-native/dist/esm/icons/refresh-cw.mjs";
import Trash2 from "lucide-react-native/dist/esm/icons/trash-2.mjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import PendingChangeItem from "@/components/offline/PendingChangeItem";
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
import { VStack } from "@/components/ui/vstack";
import {
  RATING_AFFECTED_KEYS,
  STARRED_AFFECTED_KEYS,
} from "@/hooks/backend/useMediaAnnotation";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { drainOfflineMutations } from "@/services/offlineMutations/replay";
import useApp from "@/stores/app";
import useOfflineMutations, {
  type OfflineAction,
} from "@/stores/offlineMutations";
import { invalidateKeys } from "@/utils/invalidateKeys";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

const PLAYLIST_AFFECTED_KEYS = [["playlist"], ["playlists"]] as const;

// A discarded change leaves its optimistic cache patch behind; mark the
// affected queries stale so the next (online) refetch restores server truth.
const keysForAction = (action: OfflineAction) => {
  switch (action.type) {
    case "star":
      return STARRED_AFFECTED_KEYS;
    case "setRating":
      return RATING_AFFECTED_KEYS;
    default:
      return PLAYLIST_AFFECTED_KEYS;
  }
};

export default function PendingChangesDetail() {
  const [gray500, white] = Uniwind.getCSSVariable([
    "--color-gray-500",
    "--color-white",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const isOnline = useIsOnline();
  // Plain selector form (not `.use.queue()`) so the React Compiler recognizes
  // it as a hook — the member form gets memoized as a normal call and can skip
  // the underlying store hook on some renders, breaking the hook order.
  const queue = useOfflineMutations((s) => s.queue);

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const isEmpty = queue.length === 0;
  const canSync = isOnline && !isEmpty;

  const handleClearAllPress = () => {
    setShowClearConfirm(false);
    const actions = queue.map((item) => item.action);
    useOfflineMutations.getState().clear();
    invalidateKeys(
      queryClient,
      actions.flatMap((action) => keysForAction(action)),
    );
  };

  const handleRemovePress = (id: string) => {
    const item = queue.find((entry) => entry.id === id);
    if (!item) return;
    useOfflineMutations.getState().remove([id]);
    invalidateKeys(queryClient, keysForAction(item.action));
  };

  const handleSyncNowPress = () => {
    if (!canSync) return;
    void drainOfflineMutations();
  };

  return (
    <Box className="h-full">
      <Box className={cn("pb-6 flex-1", isWideLayout ? "mb-6" : "mt-6")}>
        <HStack
          className="items-center mb-4 px-6"
          style={{ paddingTop: insets.top }}
        >
          <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <Heading
            className="text-white text-center truncate flex-1 mx-2"
            size="lg"
            numberOfLines={1}
          >
            {t("app.pendingChanges.title")}
          </Heading>
          <Box className="w-6" />
        </HStack>
        <HStack className="items-center justify-end gap-x-6 px-6 mb-4">
          <FadeOutScaleDown onPress={canSync ? handleSyncNowPress : undefined}>
            <HStack className="items-center gap-x-2">
              <RefreshCw size={16} color={canSync ? white : gray500} />
              <Text className="text-white font-bold">
                {t("app.pendingChanges.syncNow")}
              </Text>
            </HStack>
          </FadeOutScaleDown>
          <FadeOutScaleDown
            onPress={isEmpty ? undefined : () => setShowClearConfirm(true)}
          >
            <HStack className="items-center gap-x-2">
              <Trash2 size={16} color={isEmpty ? gray500 : white} />
              <Text className="text-white font-bold">
                {t("app.pendingChanges.clearAll")}
              </Text>
            </HStack>
          </FadeOutScaleDown>
        </HStack>
        <Box className="px-6 flex-1">
          {isEmpty ? (
            <VStack className="flex-1 items-center justify-center">
              <Text className="text-primary-100 text-center">
                {t("app.pendingChanges.empty")}
              </Text>
            </VStack>
          ) : (
            <FlashList
              data={queue}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingBottom: screenBottomPadding,
              }}
              ListHeaderComponent={
                <VStack className="mb-4">
                  <Text className="text-white font-bold">
                    {t("app.pendingChanges.totalCount", {
                      count: queue.length,
                    })}
                  </Text>
                  <Text className="text-primary-100 text-sm">
                    {t("app.pendingChanges.autoSyncHint")}
                  </Text>
                </VStack>
              }
              renderItem={({ item }) => (
                <PendingChangeItem
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
              {t("app.pendingChanges.clearConfirmTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t("app.pendingChanges.clearConfirmDescription")}
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
