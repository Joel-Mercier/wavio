import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import Check from "lucide-react-native/icons/check";
import type { RefObject } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import useApplyMusicFolderSelection from "@/hooks/useApplyMusicFolderSelection";
import { useIsOnline } from "@/hooks/useIsOnline";
import useLibraryPicker, { musicFolderLabel } from "@/hooks/useLibraryPicker";
import useApp from "@/stores/app";
import type { MusicFolderSelection } from "@/stores/musicFolders";
import {
  sameMusicFolderSelection,
  toggleMusicFolder,
} from "@/utils/musicFolderSelection";
import { cn } from "@/utils/tailwind";

function PickerRow({
  label,
  isSelected,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  isSelected: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const [emerald500] = Uniwind.getCSSVariable([
    "--color-emerald-500",
  ]) as string[];
  return (
    <FadeOutScaleDown testID={testID} onPress={onPress} disabled={disabled}>
      <HStack
        className={cn("items-center justify-between px-6 py-3.5", {
          "opacity-50": disabled,
        })}
      >
        <Text
          className={cn("text-lg flex-1 pr-4", {
            "text-white": isSelected,
            "text-gray-200": !isSelected,
          })}
          numberOfLines={1}
        >
          {label}
        </Text>
        {isSelected && <Check size={22} color={emerald500} />}
      </HStack>
    </FadeOutScaleDown>
  );
}

// Switch the library the app browses. Multi-select servers tick rows freely and
// the selection is applied once, on dismiss, so a few taps cost one refetch.
export default function LibraryPickerSheet({
  sheetRef,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { folders, selection, multiSelect, allowAll } = useLibraryPicker();
  const apply = useApplyMusicFolderSelection();
  const searchAllLibraries = useApp((s) => s.searchAllLibraries);
  // Switching refetches every folder-scoped query, which needs the server.
  const isOnline = useIsOnline();
  const [draft, setDraft] = useState<{ ids: MusicFolderSelection } | null>(
    null,
  );
  const shown = draft ? draft.ids : selection;
  const allIds = folders.map((f) => String(f.id));

  const choose = (ids: MusicFolderSelection) => {
    if (multiSelect) {
      setDraft({ ids });
      return;
    }
    apply(ids);
    sheetRef.current?.dismiss();
  };

  const handleDismiss = () => {
    if (draft && !sameMusicFolderSelection(draft.ids, selection)) {
      apply(draft.ids);
    }
    setDraft(null);
  };

  return (
    <CenteredBottomSheetModal
      ref={sheetRef}
      onDismiss={handleDismiss}
      enableHalfExpand={false}
      backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
      handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      >
        <Box className="px-6 pt-2 pb-3">
          <Heading className="text-white" size="lg">
            {t("app.libraries.title")}
          </Heading>
          {multiSelect && (
            <Text className="text-sm text-primary-100 mt-1">
              {t("app.libraries.pickOneOrMore")}
            </Text>
          )}
        </Box>
        {allowAll && (
          <Box className="border-b border-primary-500 mb-1">
            <PickerRow
              testID="library-picker-all"
              label={t("app.libraries.allLibraries")}
              isSelected={shown === undefined}
              disabled={!isOnline}
              onPress={() => choose(undefined)}
            />
          </Box>
        )}
        {folders.map((folder) => {
          const id = String(folder.id);
          return (
            <PickerRow
              key={id}
              testID={`library-picker-${id}`}
              label={musicFolderLabel(folder)}
              isSelected={shown?.includes(id) ?? false}
              disabled={!isOnline}
              onPress={() =>
                choose(
                  multiSelect ? toggleMusicFolder(shown, id, allIds) : [id],
                )
              }
            />
          );
        })}
        {searchAllLibraries && (
          <Text className="text-sm text-primary-100 px-6 pt-4">
            {t("app.libraries.searchCoversAll")}
          </Text>
        )}
      </BottomSheetScrollView>
    </CenteredBottomSheetModal>
  );
}
