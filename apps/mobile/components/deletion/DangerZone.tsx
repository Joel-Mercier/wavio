import { useBottomSheet } from "@gorhom/bottom-sheet";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import Trash2 from "lucide-react-native/icons/trash-2";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAnimatedReaction, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useCanDeleteItems } from "@/hooks/useFileDeletion";
import { useIsOnline } from "@/hooks/useIsOnline";

/**
 * A collapsed "Dangerous actions" row at the bottom of an actions sheet. The
 * destructive actions only show once it is opened, so no single tap on the
 * sheet can reach them.
 *
 * Render it only where `useFileDeletionAvailable()` holds. `itemId` is what the
 * server is asked about before the delete is offered, unless `checkIds` names
 * the items the delete really covers: then every one of them must allow it.
 * The section stays open for one item only, so a reused sheet shows it closed
 * for any other item.
 */
export default function DangerZone({
  itemId,
  checkIds,
  allowed,
  onReveal,
  children,
}: {
  itemId: string | undefined;
  checkIds?: string[];
  /**
   * Already known, so the music server is neither asked nor required to be
   * reachable (Audiobookshelf items live on a server of their own).
   */
  allowed?: boolean;
  /**
   * Scrolls the sheet to its end. Called once the opened section is laid out
   * and again when the sheet, expanded to show it, settles: a sheet's scroll
   * view stays locked until it reaches its top snap point.
   */
  onReveal?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [gray200] = Uniwind.getCSSVariable(["--color-gray-200"]) as string[];
  const [expandedFor, setExpandedFor] = useState<string | undefined>();
  const expanded = itemId != null && expandedFor === itemId;
  const musicServerOnline = useIsOnline();
  const isOnline = allowed !== undefined || musicServerOnline;
  const serverCheck = useCanDeleteItems(
    checkIds ?? (itemId ? [itemId] : []),
    expanded && isOnline && allowed === undefined,
  );
  const canDelete =
    allowed === undefined
      ? serverCheck
      : { isPending: false, isError: false, data: allowed };

  const Chevron = expanded ? ChevronUp : ChevronDown;

  const { expand, animatedIndex } = useBottomSheet();
  const revealPending = useSharedValue(false);
  const reveal = () => onReveal?.();
  useAnimatedReaction(
    () => animatedIndex.value,
    (index, previous) => {
      if (!revealPending.value || index === previous) return;
      if (!Number.isInteger(index)) return;
      revealPending.value = false;
      scheduleOnRN(reveal);
    },
  );
  const handleRevealLayout = () => {
    if (!onReveal) return;
    revealPending.value = true;
    expand();
    onReveal();
  };

  return (
    <VStack className="gap-y-8">
      <FadeOutScaleDown
        testID="danger-zone-toggle"
        onPress={() => setExpandedFor(expanded ? undefined : itemId)}
      >
        <HStack className="items-center">
          <Text className="text-lg text-gray-200 flex-1">
            {t("app.fileDeletion.dangerZone")}
          </Text>
          <Chevron size={20} color={gray200} />
        </HStack>
      </FadeOutScaleDown>
      {expanded && (
        <Box onLayout={handleRevealLayout}>
          {!isOnline ? (
            <Text className="text-primary-100 text-sm">
              {t("app.fileDeletion.offline")}
            </Text>
          ) : canDelete.isPending ? (
            <HStack className="items-center">
              <Spinner color={gray200} />
            </HStack>
          ) : canDelete.data ? (
            children
          ) : (
            <Text className="text-primary-100 text-sm">
              {canDelete.isError
                ? t("app.fileDeletion.permissionCheckFailed")
                : t("app.fileDeletion.notAllowed")}
            </Text>
          )}
        </Box>
      )}
    </VStack>
  );
}

/** The red row that opens the delete confirmation. */
export function DangerZoneDeleteRow({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const [red500] = Uniwind.getCSSVariable(["--color-red-500"]) as string[];
  return (
    <FadeOutScaleDown testID="danger-zone-delete" onPress={onPress}>
      <HStack className="items-center">
        <Trash2 size={24} color={red500} />
        <Text className="ml-4 text-lg text-red-500">{label}</Text>
      </HStack>
    </FadeOutScaleDown>
  );
}
