import {
  type BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import Timer from "lucide-react-native/icons/timer";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import BottomSheetModalComponent from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { SettingsToggleRow } from "@/components/settings/SettingsRows";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { usePlayingTrack } from "@/hooks/player";
import {
  currentChapterEnd,
  usePlaybackEndProjector,
} from "@/hooks/player/usePlaybackEnd";
import { useFormatClockTime } from "@/hooks/useFormatClockTime";
import { isSleepTimerActive, useSleepTimer } from "@/services/sleepTimer";
import useApp from "@/stores/app";
import useJukebox from "@/stores/jukebox";
import type { PlaybackEnd } from "@/utils/playbackEnd";

const PRESET_MINUTES = [5, 10, 15, 30, 45, 60];

let mountedSheetRef: RefObject<BottomSheetModal | null> | null = null;

export function openSleepTimerSheet() {
  mountedSheetRef?.current?.present();
}

const clampDigits = (text: string, max: number) => {
  const digits = text.replace(/\D/g, "");
  return digits && String(Math.min(Number(digits), max));
};

export default function SleepTimerSheet() {
  const { t } = useTranslation();
  const [emerald500, gray200, primary50, white] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-gray-200",
    "--color-primary-50",
    "--color-white",
  ]) as string[];
  const sheetRef = useRef<BottomSheetModal>(null);
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [hoursText, setHoursText] = useState("");
  const [minutesText, setMinutesText] = useState("");

  const durationMs = useSleepTimer((s) => s.durationMs);
  const endOfTrack = useSleepTimer((s) => s.endOfTrack);
  const active = useSleepTimer(isSleepTimerActive);
  const setMinutes = useSleepTimer((s) => s.setMinutes);
  const setEndOfTrack = useSleepTimer((s) => s.setEndOfTrack);
  const setEndOfChapter = useSleepTimer((s) => s.setEndOfChapter);
  const chapterEnd = useSleepTimer((s) => s.chapterEnd);
  const cancel = useSleepTimer((s) => s.cancel);
  const finishTrack = useApp((s) => s.sleepTimerFinishTrack);
  const setFinishTrack = useApp((s) => s.setSleepTimerFinishTrack);
  const lastCustomMinutes = useApp((s) => s.sleepTimerLastCustomMinutes);
  const setLastCustomMinutes = useApp((s) => s.setSleepTimerLastCustomMinutes);
  const playingTrack = usePlayingTrack();
  const jukeboxActive = useJukebox((s) => s.active);
  const canEndWithTrack = !playingTrack?.isRadio && !jukeboxActive;
  const { now, project, projectTrackEnd, projectChapterEnd } =
    usePlaybackEndProjector(open);
  const canEndWithChapter = !jukeboxActive && !!currentChapterEnd(playingTrack);
  const formatClockTime = useFormatClockTime();

  const activeMinutes = durationMs != null ? durationMs / 60000 : null;
  const customActive =
    activeMinutes != null && !PRESET_MINUTES.includes(activeMinutes);

  const customMinutes = Number(hoursText || 0) * 60 + Number(minutesText || 0);
  const customValid = customMinutes > 0;

  const endFor = (inMinutes: number) =>
    project(now + inMinutes * 60000, finishTrack);
  const customEnd = customValid ? endFor(customMinutes) : null;

  useEffect(() => {
    mountedSheetRef = sheetRef;
    return () => {
      mountedSheetRef = null;
    };
  }, []);

  const handleSheetChange = (index: number) => {
    const opened = index >= 0;
    if (opened && !open) {
      const seed = customActive ? (activeMinutes as number) : lastCustomMinutes;
      setHoursText(String(Math.floor(seed / 60)));
      setMinutesText(String(Math.round(seed) % 60));
      setCustomOpen(customActive);
    }
    setOpen(opened);
  };

  const handleOffPress = () => {
    cancel();
    sheetRef.current?.dismiss();
  };

  const handlePresetPress = (presetMinutes: number) => {
    setMinutes(presetMinutes);
    sheetRef.current?.dismiss();
  };

  const handleEndOfTrackPress = () => {
    setEndOfTrack();
    sheetRef.current?.dismiss();
  };

  const handleEndOfChapterPress = () => {
    const end = currentChapterEnd(playingTrack);
    if (end) setEndOfChapter(end.itemId, end.bookTime);
    sheetRef.current?.dismiss();
  };

  const handleCustomStartPress = () => {
    if (!customValid) return;
    setMinutes(customMinutes);
    setLastCustomMinutes(customMinutes);
    sheetRef.current?.dismiss();
  };

  const optionColor = (selected: boolean) => ({
    color: selected ? emerald500 : gray200,
  });

  const endLabel = (end: PlaybackEnd | null) => {
    if (!end) return null;
    return (
      <Text className="text-primary-100 text-sm">
        {`${end.approximate ? "~" : ""}${formatClockTime(end.at)}`}
      </Text>
    );
  };

  return (
    <BottomSheetModalComponent
      ref={sheetRef}
      onChange={handleSheetChange}
      enableHalfExpand={false}
      keyboardBlurBehavior="restore"
      backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
      handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ alignItems: "center" }}
      >
        <Box className="p-6 w-full mb-12">
          <HStack className="items-center mb-6">
            <Timer size={24} color={gray200} />
            <Heading
              className="ml-4 text-white font-normal"
              size="lg"
              numberOfLines={1}
            >
              {t("app.player.sleepTimer")}
            </Heading>
          </HStack>
          <VStack className="gap-y-6">
            <FadeOutScaleDown onPress={handleOffPress}>
              <Text className="text-lg" style={optionColor(!active)}>
                {t("app.player.sleepTimerOff")}
              </Text>
            </FadeOutScaleDown>
            {PRESET_MINUTES.map((presetMinutes) => (
              <FadeOutScaleDown
                key={presetMinutes}
                onPress={() => handlePresetPress(presetMinutes)}
              >
                <HStack className="items-center justify-between">
                  <Text
                    className="text-lg"
                    style={optionColor(activeMinutes === presetMinutes)}
                  >
                    {t("app.player.sleepTimerMinutes", {
                      count: presetMinutes,
                    })}
                  </Text>
                  {endLabel(endFor(presetMinutes))}
                </HStack>
              </FadeOutScaleDown>
            ))}
            <VStack className="gap-y-4">
              <FadeOutScaleDown onPress={() => setCustomOpen(!customOpen)}>
                <Text className="text-lg" style={optionColor(customActive)}>
                  {t("app.player.sleepTimerCustom")}
                </Text>
              </FadeOutScaleDown>
              {customOpen && (
                <VStack className="gap-y-4">
                  <HStack className="gap-x-4">
                    {[
                      {
                        label: t("app.player.sleepTimerHours"),
                        value: hoursText,
                        max: 23,
                        onChange: setHoursText,
                      },
                      {
                        label: t("app.player.sleepTimerMinutesLabel"),
                        value: minutesText,
                        max: 59,
                        onChange: setMinutesText,
                      },
                    ].map((field) => (
                      <VStack key={field.label} className="flex-1 gap-y-2">
                        <Text className="text-primary-100 text-sm">
                          {field.label}
                        </Text>
                        <Box className="border border-primary-600 bg-primary-600 rounded-md px-4">
                          <BottomSheetTextInput
                            value={field.value}
                            onChangeText={(text) =>
                              field.onChange(clampDigits(text, field.max))
                            }
                            keyboardType="number-pad"
                            maxLength={2}
                            selectTextOnFocus
                            placeholder="0"
                            placeholderTextColor={primary50}
                            style={{
                              color: white,
                              fontSize: 16,
                              paddingVertical: 10,
                            }}
                          />
                        </Box>
                      </VStack>
                    ))}
                  </HStack>
                  <HStack className="items-center justify-between">
                    <Text className="text-primary-100 text-sm">
                      {customEnd
                        ? t(
                            customEnd.approximate
                              ? "app.player.sleepTimerEndsAround"
                              : "app.player.sleepTimerEndsAt",
                            { time: formatClockTime(customEnd.at) },
                          )
                        : ""}
                    </Text>
                    <FadeOutScaleDown
                      className="items-center justify-center py-2 px-6 border border-emerald-500 bg-emerald-500 rounded-full"
                      disabled={!customValid}
                      onPress={handleCustomStartPress}
                    >
                      <Text className="text-primary-800 font-bold">
                        {t("app.player.sleepTimerStart")}
                      </Text>
                    </FadeOutScaleDown>
                  </HStack>
                </VStack>
              )}
            </VStack>
            {canEndWithChapter && (
              <FadeOutScaleDown onPress={handleEndOfChapterPress}>
                <HStack className="items-center justify-between">
                  <Text
                    className="text-lg"
                    style={optionColor(chapterEnd != null)}
                  >
                    {t("app.player.sleepTimerEndOfChapter")}
                  </Text>
                  {endLabel(projectChapterEnd(chapterEnd?.bookTime))}
                </HStack>
              </FadeOutScaleDown>
            )}
            {canEndWithTrack && (
              <FadeOutScaleDown onPress={handleEndOfTrackPress}>
                <HStack className="items-center justify-between">
                  <Text className="text-lg" style={optionColor(endOfTrack)}>
                    {t("app.player.sleepTimerEndOfTrack")}
                  </Text>
                  {endLabel(projectTrackEnd())}
                </HStack>
              </FadeOutScaleDown>
            )}
          </VStack>
          {canEndWithTrack && (
            <SettingsToggleRow
              label={t("app.player.sleepTimerFinishTrack")}
              description={t("app.player.sleepTimerFinishTrackDescription")}
              value={finishTrack}
              onToggle={setFinishTrack}
            />
          )}
        </Box>
      </BottomSheetScrollView>
    </BottomSheetModalComponent>
  );
}
