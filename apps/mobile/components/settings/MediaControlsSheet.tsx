import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import Heart from "lucide-react-native/icons/heart";
import Play from "lucide-react-native/icons/play";
import Repeat from "lucide-react-native/icons/repeat";
import RotateCcw from "lucide-react-native/icons/rotate-ccw";
import RotateCw from "lucide-react-native/icons/rotate-cw";
import Shuffle from "lucide-react-native/icons/shuffle";
import SkipBack from "lucide-react-native/icons/skip-back";
import SkipForward from "lucide-react-native/icons/skip-forward";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import useApp, {
  MEDIA_CONTROL_BUTTONS,
  type MediaControlButton,
  type MediaControlSide,
} from "@/stores/app";
import { cn } from "@/utils/tailwind";

const SLOT_SIZE = 32;
const ICON_SIZE = 24;

const BUTTON_OPTIONS = [null, ...MEDIA_CONTROL_BUTTONS];

export function mediaControlButtonLabelKey(button: MediaControlButton | null) {
  return `app.settings.playbackSettings.mediaControlsButtons.${button ?? "none"}`;
}

function PreviewButton({ button }: { button: MediaControlButton | null }) {
  if (!button) {
    return (
      <Box
        className="rounded-full border border-dashed border-primary-300"
        style={{ width: SLOT_SIZE, height: SLOT_SIZE }}
      />
    );
  }
  if (button === "seekBackward" || button === "seekForward") {
    const Icon = button === "seekBackward" ? RotateCcw : RotateCw;
    return (
      <Box
        className="items-center justify-center"
        style={{ width: SLOT_SIZE, height: SLOT_SIZE }}
      >
        <Icon size={ICON_SIZE} color="white" strokeWidth={1.75} />
        <Box className="absolute inset-0 items-center justify-center">
          <Text className="text-white font-bold text-[8px]">10</Text>
        </Box>
      </Box>
    );
  }
  const Icon = { favorite: Heart, shuffle: Shuffle, repeat: Repeat }[button];
  return (
    <Box
      className="items-center justify-center"
      style={{ width: SLOT_SIZE, height: SLOT_SIZE }}
    >
      <Icon size={ICON_SIZE} color="white" />
    </Box>
  );
}

function SidePicker({
  side,
  selected,
}: {
  side: MediaControlSide;
  selected: MediaControlButton | null;
}) {
  const { t } = useTranslation();
  const setMediaControlButton = useApp((store) => store.setMediaControlButton);
  return (
    <VStack className="gap-y-3">
      <Text className="text-lg text-gray-200">
        {t(
          side === "left"
            ? "app.settings.playbackSettings.mediaControlsLeftLabel"
            : "app.settings.playbackSettings.mediaControlsRightLabel",
        )}
      </Text>
      <HStack className="flex-wrap gap-2">
        {BUTTON_OPTIONS.map((button) => (
          <FadeOutScaleDown
            key={button ?? "none"}
            onPress={() => setMediaControlButton(side, button)}
          >
            <Badge
              className={cn("rounded-full bg-primary-500 px-4 py-1", {
                "bg-emerald-500": button === selected,
              })}
            >
              <BadgeText className="normal-case text-md text-white">
                {t(mediaControlButtonLabelKey(button))}
              </BadgeText>
            </Badge>
          </FadeOutScaleDown>
        ))}
      </HStack>
    </VStack>
  );
}

/** Picks the optional buttons on each side of the Android media notification. */
export default function MediaControlsSheet({
  modalRef,
}: {
  modalRef: RefObject<BottomSheetModal | null>;
}) {
  const { t } = useTranslation();
  const mediaControlsLeft = useApp((store) => store.mediaControlsLeft);
  const mediaControlsRight = useApp((store) => store.mediaControlsRight);
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
              {t("app.settings.playbackSettings.mediaControlsLabel")}
            </Heading>
            <Text className="text-primary-100 text-sm">
              {t("app.settings.playbackSettings.mediaControlsDescription")}
            </Text>
          </VStack>
          <HStack className="mt-6 items-center justify-between rounded-2xl bg-primary-800 px-6 py-4">
            <PreviewButton button={mediaControlsLeft} />
            <SkipBack size={ICON_SIZE} color="white" fill="white" />
            <Box className="h-12 w-12 items-center justify-center rounded-full bg-white">
              <Play size={20} color="black" fill="black" />
            </Box>
            <SkipForward size={ICON_SIZE} color="white" fill="white" />
            <PreviewButton button={mediaControlsRight} />
          </HStack>
          <VStack className="mt-6 gap-y-6">
            <SidePicker side="left" selected={mediaControlsLeft} />
            <SidePicker side="right" selected={mediaControlsRight} />
          </VStack>
        </Box>
      </BottomSheetScrollView>
    </CenteredBottomSheetModal>
  );
}
