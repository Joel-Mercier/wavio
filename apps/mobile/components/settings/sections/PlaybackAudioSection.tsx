import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import * as Application from "expo-application";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import OptionsBottomSheetModal from "@/components/settings/OptionsBottomSheetModal";
import {
  SettingsActionRow,
  SettingsSectionTitle,
  SettingsSelectRow,
  SettingsStepperRow,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Divider } from "@/components/ui/divider";
import { VStack } from "@/components/ui/vstack";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import {
  isEqualizerAvailable,
  openSystemEqualizer,
} from "@/services/equalizer";
import useApp, { type StreamFormat } from "@/stores/app";
import { useAuthBase } from "@/stores/auth";

const bitRateOptions: (number | null)[] = [null, 64, 96, 128, 192, 256, 320];

const streamingFormatOptions: StreamFormat[] = [
  "raw",
  "flac",
  "opus",
  "mp3",
  "aac",
];

const replayGainOptions: ("off" | "track" | "album")[] = [
  "off",
  "track",
  "album",
];

const lyricsSourceOptions: ("off" | "server" | "all")[] = [
  "off",
  "server",
  "all",
];

const queueSyncOptions: ("server" | "local" | "off")[] = [
  "server",
  "local",
  "off",
];

export default function PlaybackAudioSection() {
  const { t } = useTranslation();
  const { showErrorToast } = useSettingsToast();
  const capabilities = useCapabilities();
  const isLocal = useAuthBase((store) => store.serverType === "local");

  const bottomSheetBitRateModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetCellularBitRateModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetStreamingFormatModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetReplayGainModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetQueueSyncModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetLyricsSourceModalRef = useRef<BottomSheetModal>(null);

  const maxBitRate = useApp((store) => store.maxBitRate);
  const setMaxBitRate = useApp((store) => store.setMaxBitRate);
  const cellularMaxBitRate = useApp((store) => store.cellularMaxBitRate);
  const setCellularMaxBitRate = useApp((store) => store.setCellularMaxBitRate);
  const streamingFormat = useApp((store) => store.streamingFormat);
  const setStreamingFormat = useApp((store) => store.setStreamingFormat);
  const replayGainMode = useApp((store) => store.replayGainMode);
  const setReplayGainMode = useApp((store) => store.setReplayGainMode);
  const replayGainPreampDb = useApp((store) => store.replayGainPreampDb);
  const setReplayGainPreampDb = useApp((store) => store.setReplayGainPreampDb);
  const endlessPlaybackEnabled = useApp(
    (store) => store.endlessPlaybackEnabled,
  );
  const setEndlessPlaybackEnabled = useApp(
    (store) => store.setEndlessPlaybackEnabled,
  );
  const queueSyncPriority = useApp((store) => store.queueSyncPriority);
  const setQueueSyncPriority = useApp((store) => store.setQueueSyncPriority);
  const lyricsSource = useApp((store) => store.lyricsSource);
  const setLyricsSource = useApp((store) => store.setLyricsSource);
  const lyricsKeepScreenOn = useApp((store) => store.lyricsKeepScreenOn);
  const setLyricsKeepScreenOn = useApp((store) => store.setLyricsKeepScreenOn);

  const adjustPreamp = (delta: number) => {
    const next = Math.min(15, Math.max(-15, replayGainPreampDb + delta));
    setReplayGainPreampDb(next);
  };

  const handleOpenEqualizerPress = async () => {
    try {
      await openSystemEqualizer(Application.applicationId ?? "");
    } catch {
      showErrorToast(t("app.settings.playbackSettings.equalizerErrorMessage"));
    }
  };

  const formatBitRate = (value: number | null) =>
    value === null
      ? t("app.settings.streamingSettings.audioQualityOriginal")
      : t("app.settings.streamingSettings.audioQualityKbps", {
          bitrate: value,
        });

  return (
    <SettingsScreenScaffold
      title={t("app.settings.menu.playback.title")}
      overlays={
        <>
          <OptionsBottomSheetModal
            modalRef={bottomSheetQueueSyncModalRef}
            header={t("app.settings.playbackSettings.queueSyncLabel")}
            headerDescription={t(
              "app.settings.playbackSettings.queueSyncDescription",
            )}
            options={queueSyncOptions.map((option) => ({
              value: option,
              label: t(
                `app.settings.playbackSettings.queueSyncOptions.${option}.label`,
              ),
              description: t(
                `app.settings.playbackSettings.queueSyncOptions.${option}.description`,
              ),
            }))}
            selectedValue={queueSyncPriority}
            onSelect={setQueueSyncPriority}
            dismissOnSelect
          />
          <OptionsBottomSheetModal
            modalRef={bottomSheetLyricsSourceModalRef}
            header={t("app.settings.displaySettings.lyricsSourceLabel")}
            headerDescription={t(
              "app.settings.displaySettings.lyricsSourceDescription",
            )}
            options={lyricsSourceOptions.map((option) => ({
              value: option,
              label: t(
                `app.settings.displaySettings.lyricsSourceOptions.${option}`,
              ),
            }))}
            selectedValue={lyricsSource}
            onSelect={setLyricsSource}
            dismissOnSelect
          />
          <OptionsBottomSheetModal
            modalRef={bottomSheetBitRateModalRef}
            header={t("app.settings.streamingSettings.audioQualityLabel")}
            headerDescription={t(
              "app.settings.streamingSettings.audioQualityDescription",
            )}
            options={bitRateOptions.map((option) => ({
              value: option,
              label: formatBitRate(option),
            }))}
            selectedValue={maxBitRate}
            onSelect={setMaxBitRate}
          />
          <OptionsBottomSheetModal
            modalRef={bottomSheetCellularBitRateModalRef}
            header={t(
              "app.settings.streamingSettings.cellularAudioQualityLabel",
            )}
            headerDescription={t(
              "app.settings.streamingSettings.cellularAudioQualityDescription",
            )}
            options={bitRateOptions.map((option) => ({
              value: option,
              label: formatBitRate(option),
            }))}
            selectedValue={cellularMaxBitRate}
            onSelect={setCellularMaxBitRate}
          />
          <OptionsBottomSheetModal
            modalRef={bottomSheetStreamingFormatModalRef}
            header={t("app.settings.streamingSettings.streamingFormatLabel")}
            headerDescription={t(
              "app.settings.streamingSettings.streamingFormatDescription",
            )}
            options={streamingFormatOptions.map((option) => ({
              value: option,
              label: t(
                `app.settings.streamingSettings.streamingFormatOptions.${option}`,
              ),
            }))}
            selectedValue={streamingFormat}
            onSelect={setStreamingFormat}
            dismissOnSelect
          />
          <OptionsBottomSheetModal
            modalRef={bottomSheetReplayGainModalRef}
            header={t("app.settings.streamingSettings.replayGainLabel")}
            headerDescription={t(
              "app.settings.streamingSettings.replayGainDescription",
            )}
            options={replayGainOptions.map((option) => ({
              value: option,
              label: t(
                `app.settings.streamingSettings.replayGainModes.${option}`,
              ),
            }))}
            selectedValue={replayGainMode}
            onSelect={setReplayGainMode}
          />
        </>
      }
    >
      <VStack className="gap-y-4">
        <SettingsSectionTitle
          title={t("app.settings.playbackSettings.title")}
        />
        <SettingsToggleRow
          label={t("app.settings.playbackSettings.endlessPlaybackLabel")}
          description={t(
            "app.settings.playbackSettings.endlessPlaybackDescription",
          )}
          value={endlessPlaybackEnabled}
          onToggle={(value) => setEndlessPlaybackEnabled(value)}
        />
        {isEqualizerAvailable() && (
          <SettingsActionRow
            layout="wide"
            label={t("app.settings.playbackSettings.equalizerLabel")}
            description={t(
              "app.settings.playbackSettings.equalizerDescription",
            )}
            actionLabel={t("app.settings.playbackSettings.equalizerAction")}
            onPress={handleOpenEqualizerPress}
          />
        )}
        {capabilities.playQueueSync && (
          <SettingsSelectRow
            label={t("app.settings.playbackSettings.queueSyncLabel")}
            description={t(
              "app.settings.playbackSettings.queueSyncDescription",
            )}
            badgeText={t(
              `app.settings.playbackSettings.queueSyncOptions.${queueSyncPriority}.label`,
            )}
            onPress={() => bottomSheetQueueSyncModalRef.current?.present()}
          />
        )}
        <SettingsSelectRow
          label={t("app.settings.displaySettings.lyricsSourceLabel")}
          description={t(
            "app.settings.displaySettings.lyricsSourceDescription",
          )}
          badgeText={t(
            `app.settings.displaySettings.lyricsSourceOptions.${lyricsSource}`,
          )}
          onPress={() => bottomSheetLyricsSourceModalRef.current?.present()}
        />
        <SettingsToggleRow
          label={t("app.settings.displaySettings.lyricsKeepScreenOnLabel")}
          description={t(
            "app.settings.displaySettings.lyricsKeepScreenOnDescription",
          )}
          value={lyricsKeepScreenOn}
          onToggle={(value) => setLyricsKeepScreenOn(value)}
          disabled={lyricsSource === "off"}
        />
        <Divider className="bg-primary-400" />
        <SettingsSectionTitle
          title={t("app.settings.streamingSettings.title")}
        />
        {!isLocal && (
          <>
            <SettingsSelectRow
              label={t("app.settings.streamingSettings.audioQualityLabel")}
              description={t(
                "app.settings.streamingSettings.audioQualityDescription",
              )}
              badgeText={formatBitRate(maxBitRate)}
              onPress={() => bottomSheetBitRateModalRef.current?.present()}
            />
            <SettingsSelectRow
              label={t(
                "app.settings.streamingSettings.cellularAudioQualityLabel",
              )}
              description={t(
                "app.settings.streamingSettings.cellularAudioQualityDescription",
              )}
              badgeText={formatBitRate(cellularMaxBitRate)}
              onPress={() =>
                bottomSheetCellularBitRateModalRef.current?.present()
              }
            />
          </>
        )}
        {capabilities.streamFormatSelection && (
          <SettingsSelectRow
            label={t("app.settings.streamingSettings.streamingFormatLabel")}
            description={t(
              "app.settings.streamingSettings.streamingFormatDescription",
            )}
            badgeText={t(
              `app.settings.streamingSettings.streamingFormatOptions.${streamingFormat}`,
            )}
            onPress={() =>
              bottomSheetStreamingFormatModalRef.current?.present()
            }
          />
        )}
        {capabilities.replayGain && (
          <SettingsSelectRow
            label={t("app.settings.streamingSettings.replayGainLabel")}
            description={t(
              "app.settings.streamingSettings.replayGainDescription",
            )}
            badgeText={t(
              `app.settings.streamingSettings.replayGainModes.${replayGainMode}`,
            )}
            onPress={() => bottomSheetReplayGainModalRef.current?.present()}
          />
        )}
        {capabilities.replayGain && (
          <SettingsStepperRow
            label={t("app.settings.streamingSettings.replayGainPreampLabel")}
            description={t(
              "app.settings.streamingSettings.replayGainPreampDescription",
            )}
            valueText={t(
              "app.settings.streamingSettings.replayGainPreampValue",
              {
                db:
                  replayGainPreampDb > 0
                    ? `+${replayGainPreampDb}`
                    : replayGainPreampDb,
              },
            )}
            valueClassName="w-16"
            onDecrement={() => adjustPreamp(-1)}
            onIncrement={() => adjustPreamp(1)}
            disabled={replayGainMode === "off"}
          />
        )}
      </VStack>
    </SettingsScreenScaffold>
  );
}
