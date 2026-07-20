import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import Check from "lucide-react-native/dist/esm/icons/check.mjs";
import Smartphone from "lucide-react-native/dist/esm/icons/smartphone.mjs";
import Speaker from "lucide-react-native/dist/esm/icons/speaker.mjs";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import BottomSheetModalComponent from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import GestureSlider from "@/components/GestureSlider";
import { setJukeboxSheetRef } from "@/components/player/jukeboxSheetController";
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
  activate as activateJukebox,
  jukeboxReconcileFromServer,
  jukeboxRefreshStatus,
  jukeboxSetGain,
  takeOverLocally,
} from "@/services/jukebox";
import {
  getCurrentTime,
  isPlaying as isLocalPlaying,
  pause as pauseLocal,
  play as playLocal,
} from "@/services/player";
import useJukebox from "@/stores/jukebox";
import useQueue from "@/stores/queue";
import { logError } from "@/utils/log";

// App-wide jukebox device sheet. Mounted once at the app root and opened from
// anywhere via the jukeboxSheetController (player chrome, floating player).
export default function JukeboxSheet() {
  const { t } = useTranslation();
  const toast = useToast();
  const [emerald500, gray200] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-gray-200",
  ]) as string[];
  const sheetRef = useRef<BottomSheetModal>(null);
  const jukeboxActive = useJukebox((s) => s.active);
  const jukeboxGain = useJukebox((s) => s.gain);
  const jukeboxStatus = useJukebox((s) => s.status);
  const queueLength = useQueue((s) => s.queue.length);

  useEffect(() => {
    setJukeboxSheetRef(sheetRef);
    return () => setJukeboxSheetRef(null);
  }, []);

  const handleJukeboxToggle = async () => {
    if (jukeboxActive) {
      try {
        await takeOverLocally();
      } catch (e) {
        logError(e);
      }
      sheetRef.current?.dismiss();
      return;
    }
    const position = getCurrentTime();
    const wasPlaying = isLocalPlaying();
    pauseLocal();
    try {
      await activateJukebox({ position, autoplay: wasPlaying });
    } catch (error) {
      logError(error);
      if (wasPlaying) playLocal();
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.player.jukeboxErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  const handleJukeboxGainChange = (value: number) => {
    jukeboxSetGain(value).catch(() => {});
  };

  // Ping the server for live jukebox state whenever the sheet opens, rather than
  // relying on stale cached status. When a session is active, also pull the
  // playlist so another device's changes are reflected.
  const handleSheetChange = useCallback((index: number) => {
    if (index < 0) return;
    jukeboxRefreshStatus().catch(() => {});
    if (useJukebox.getState().active) {
      jukeboxReconcileFromServer().catch(() => {});
    }
  }, []);

  const selectJukeboxDevice = (device: "local" | "jukebox") => {
    if ((device === "jukebox") === jukeboxActive) return;
    handleJukeboxToggle();
  };

  return (
    <BottomSheetModalComponent
      ref={sheetRef}
      onChange={handleSheetChange}
      backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
      handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
    >
      <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
        <Box className="p-6 w-full mb-12">
          <HStack className="items-center mb-6">
            <Speaker size={24} color={jukeboxActive ? emerald500 : gray200} />
            <Heading
              className="ml-4 text-white font-normal"
              size="lg"
              numberOfLines={1}
            >
              {t("app.player.jukebox")}
            </Heading>
          </HStack>
          <VStack className="gap-y-6">
            <FadeOutScaleDown onPress={() => selectJukeboxDevice("local")}>
              <HStack className="items-center justify-between">
                <HStack className="items-center">
                  <Smartphone
                    size={20}
                    color={jukeboxActive ? gray200 : emerald500}
                  />
                  <Text
                    className="ml-4 text-lg"
                    style={{ color: jukeboxActive ? gray200 : emerald500 }}
                  >
                    {t("app.player.jukeboxDeviceThis")}
                  </Text>
                </HStack>
                {!jukeboxActive && <Check size={20} color={emerald500} />}
              </HStack>
            </FadeOutScaleDown>
            <FadeOutScaleDown onPress={() => selectJukeboxDevice("jukebox")}>
              <HStack className="items-center justify-between">
                <HStack className="items-center">
                  <Speaker
                    size={20}
                    color={jukeboxActive ? emerald500 : gray200}
                  />
                  <Text
                    className="ml-4 text-lg"
                    style={{ color: jukeboxActive ? emerald500 : gray200 }}
                  >
                    {t("app.player.jukebox")}
                  </Text>
                </HStack>
                {jukeboxActive && <Check size={20} color={emerald500} />}
              </HStack>
            </FadeOutScaleDown>
            {jukeboxActive && (
              <VStack className="gap-y-2">
                <Text className="text-sm text-primary-100">
                  {t("app.player.jukeboxGain")}
                </Text>
                <GestureSlider
                  value={jukeboxGain}
                  onScrub={handleJukeboxGainChange}
                />
                {jukeboxStatus && (
                  <Text className="text-sm text-primary-100 mt-2">
                    {t("app.player.jukeboxStatus", {
                      state: jukeboxStatus.playing
                        ? t("app.player.jukeboxStatePlaying")
                        : t("app.player.jukeboxStatePaused"),
                      index: (jukeboxStatus.currentIndex ?? 0) + 1,
                      total: queueLength,
                    })}
                  </Text>
                )}
              </VStack>
            )}
          </VStack>
        </Box>
      </BottomSheetScrollView>
    </BottomSheetModalComponent>
  );
}
