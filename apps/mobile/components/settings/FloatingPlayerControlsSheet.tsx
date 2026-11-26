import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import AudioLines from "lucide-react-native/icons/audio-lines";
import Cast from "lucide-react-native/icons/cast";
import Heart from "lucide-react-native/icons/heart";
import Play from "lucide-react-native/icons/play";
import Repeat from "lucide-react-native/icons/repeat";
import Shuffle from "lucide-react-native/icons/shuffle";
import SkipBack from "lucide-react-native/icons/skip-back";
import SkipForward from "lucide-react-native/icons/skip-forward";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import { SeekActionIcon } from "@/components/player/FloatingPlayerActionButton";
import ButtonSlotPicker from "@/components/settings/ButtonSlotPicker";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import useApp, {
  FLOATING_PLAYER_ACTIONS,
  type FloatingPlayerAction,
} from "@/stores/app";

const ICON_SIZE = 24;

export function floatingPlayerActionLabelKey(
  action: FloatingPlayerAction | null,
) {
  return `app.settings.playbackSettings.floatingPlayerActions.${action ?? "none"}`;
}

function PreviewAction({ action }: { action: FloatingPlayerAction | null }) {
  switch (action) {
    case null:
      return (
        <Box
          className="rounded-full border border-dashed border-primary-300"
          style={{ width: ICON_SIZE, height: ICON_SIZE }}
        />
      );
    case "seekBackward":
    case "seekForward":
      return (
        <SeekActionIcon
          direction={action === "seekBackward" ? "backward" : "forward"}
          seconds={10}
          size={ICON_SIZE}
        />
      );
    case "skipPrevious":
      return <SkipBack size={ICON_SIZE} color="white" fill="white" />;
    case "skipNext":
      return <SkipForward size={ICON_SIZE} color="white" fill="white" />;
    default: {
      const Icon = {
        cast: Cast,
        favorite: Heart,
        shuffle: Shuffle,
        repeat: Repeat,
      }[action];
      return <Icon size={ICON_SIZE} color="white" />;
    }
  }
}

export default function FloatingPlayerControlsSheet({
  modalRef,
}: {
  modalRef: RefObject<BottomSheetModal | null>;
}) {
  const { t } = useTranslation();
  const floatingPlayerAction1 = useApp((store) => store.floatingPlayerAction1);
  const floatingPlayerAction2 = useApp((store) => store.floatingPlayerAction2);
  const setFloatingPlayerAction = useApp(
    (store) => store.setFloatingPlayerAction,
  );
  const optionLabel = (action: FloatingPlayerAction | null) =>
    t(floatingPlayerActionLabelKey(action));
  return (
    <CenteredBottomSheetModal
      ref={modalRef}
      enableHalfExpand={false}
      backgroundStyle={{
        backgroundColor: "rgb(41, 41, 41)",
      }}
      handleIndicatorStyle={{
        backgroundColor: "#b3b3b3",
      }}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ alignItems: "center" }}
      >
        <Box className="p-6 w-full mb-12">
          <VStack className="gap-y-2">
            <Heading className="text-white font-bold" size="md">
              {t("app.settings.playbackSettings.floatingPlayerControlsLabel")}
            </Heading>
            <Text className="text-primary-100 text-sm">
              {t(
                "app.settings.playbackSettings.floatingPlayerControlsDescription",
              )}
            </Text>
          </VStack>
          <HStack className="mt-6 h-16 items-center rounded-md bg-primary-800 px-4 py-2">
            <Box className="w-12 h-12 rounded-md bg-primary-600 items-center justify-center">
              <AudioLines size={ICON_SIZE} color="white" />
            </Box>
            <VStack className="ml-4 flex-1 gap-y-2">
              <Box className="h-2.5 w-3/4 rounded-full bg-primary-400" />
              <Box className="h-2 w-1/2 rounded-full bg-primary-500" />
            </VStack>
            <HStack className="items-center pl-4 gap-4">
              <PreviewAction action={floatingPlayerAction1} />
              <PreviewAction action={floatingPlayerAction2} />
              <Play size={ICON_SIZE} color="white" fill="white" />
            </HStack>
          </HStack>
          <VStack className="mt-6 gap-y-6">
            <ButtonSlotPicker
              label={t(
                "app.settings.playbackSettings.floatingPlayerAction1Label",
              )}
              options={FLOATING_PLAYER_ACTIONS}
              selected={floatingPlayerAction1}
              optionLabel={optionLabel}
              onSelect={(action) => setFloatingPlayerAction(1, action)}
            />
            <ButtonSlotPicker
              label={t(
                "app.settings.playbackSettings.floatingPlayerAction2Label",
              )}
              options={FLOATING_PLAYER_ACTIONS}
              selected={floatingPlayerAction2}
              optionLabel={optionLabel}
              onSelect={(action) => setFloatingPlayerAction(2, action)}
            />
          </VStack>
        </Box>
      </BottomSheetScrollView>
    </CenteredBottomSheetModal>
  );
}
