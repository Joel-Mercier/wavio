import { Directory } from "expo-file-system";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  SettingsActionRow,
  SettingsSectionTitle,
  SettingsSelectRow,
  SettingsStepperRow,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import {
  DateTimePicker,
  DateTimePickerIcon,
  DateTimePickerInput,
  DateTimePickerTrigger,
} from "@/components/ui/date-time-picker";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ClockIcon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import {
  isAutoBackupSupported,
  runAutoBackup,
  useAutoBackupStatus,
} from "@/services/autoBackup";
import { folderLabel } from "@/services/local/paths";
import {
  isRestrictedTreeUri,
  isSupportedTreeUri,
} from "@/services/offline/downloadDestination";
import { probeWritableTree } from "@/services/writableTree";
import useApp, {
  AUTO_BACKUP_KEEP_MAX,
  AUTO_BACKUP_KEEP_MIN,
  useAppBase,
} from "@/stores/app";
import { formatDistanceToNow } from "@/utils/date";
import { logError } from "@/utils/log";

type FolderError = "restricted" | "unsupported" | "unwritable";

// The download-location wording is about folders in general, so it is shared.
const FOLDER_ERROR_KEYS: Record<FolderError, string> = {
  restricted: "app.settings.offlineSettings.downloadLocationRestricted",
  unsupported: "app.settings.offlineSettings.downloadLocationUnsupported",
  unwritable: "app.settings.offlineSettings.downloadLocationUnwritable",
};

// Same acceptance rules as the download location: SAF child names are only
// readable on the external-storage provider, and pruning old backups needs them.
async function pickBackupFolder(): Promise<string | FolderError | null> {
  let picked: Directory;
  try {
    picked = await Directory.pickDirectoryAsync();
  } catch (error) {
    // Cancel and failure reject alike; see useDownloadLocation.
    logError("[AutoBackupSettings] Directory picker dismissed", error);
    return null;
  }
  if (isRestrictedTreeUri(picked.uri)) return "restricted";
  if (!isSupportedTreeUri(picked.uri)) return "unsupported";
  if (!probeWritableTree(picked.uri)) return "unwritable";
  return picked.uri;
}

const isFolderError = (value: string): value is FolderError =>
  value in FOLDER_ERROR_KEYS;

function timeOfDay(minuteOfDay: number): Date {
  const date = new Date();
  date.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
  return date;
}

export default function AutoBackupSettings() {
  const { t } = useTranslation();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  // Plain selector form; see useDownloadLocation for why not `useApp.use.*`.
  const enabled = useApp((s) => s.autoBackupEnabled);
  const folderUri = useApp((s) => s.autoBackupFolderUri);
  const minuteOfDay = useApp((s) => s.autoBackupMinuteOfDay);
  const keepCount = useApp((s) => s.autoBackupKeepCount);
  const status = useAutoBackupStatus();
  const [folderError, setFolderError] = useState<FolderError | null>(null);
  const [folderWritable, setFolderWritable] = useState(true);
  const [backingUp, setBackingUp] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: each run is a trigger too, so a folder that went away shows here
  useEffect(() => {
    setFolderWritable(folderUri ? probeWritableTree(folderUri) : true);
  }, [folderUri, status.lastAttemptAt]);

  if (!isAutoBackupSupported()) return null;

  const chooseFolder = async (): Promise<boolean> => {
    const result = await pickBackupFolder();
    if (result === null) return false;
    if (isFolderError(result)) {
      setFolderError(result);
      return false;
    }
    setFolderError(null);
    useAppBase.getState().setAutoBackupFolderUri(result);
    return true;
  };

  const handleToggle = async (value: boolean) => {
    if (value && !folderUri && !(await chooseFolder())) return;
    useAppBase.getState().setAutoBackupEnabled(value);
  };

  const handleBackUpNow = async () => {
    setBackingUp(true);
    try {
      const ok = await runAutoBackup({ force: true });
      if (ok) {
        showSuccessToast(
          t("app.settings.backupSettings.autoBackupNowSuccessMessage"),
        );
      } else {
        showErrorToast(
          t("app.settings.backupSettings.autoBackupNowErrorMessage"),
        );
      }
    } finally {
      setBackingUp(false);
    }
  };

  // The folder row says what is wrong with the folder.
  const statusText = status.lastError
    ? t("app.settings.backupSettings.autoBackupLastFailed")
    : status.lastSuccessAt
      ? t("app.settings.backupSettings.autoBackupLastSuccess", {
          time: formatDistanceToNow(new Date(status.lastSuccessAt)),
        })
      : t("app.settings.backupSettings.autoBackupNever");

  return (
    <VStack>
      <SettingsSectionTitle
        title={t("app.settings.backupSettings.autoBackupTitle")}
      />
      <SettingsToggleRow
        label={t("app.settings.backupSettings.autoBackupLabel")}
        description={t("app.settings.backupSettings.autoBackupDescription")}
        value={enabled}
        onToggle={handleToggle}
      >
        {enabled && (
          <Text
            className={
              status.lastError
                ? "text-orange-400 text-sm"
                : "text-emerald-400 text-sm"
            }
          >
            {statusText}
          </Text>
        )}
      </SettingsToggleRow>
      {!enabled && folderError && (
        <Text className="text-orange-400 text-sm pb-4">
          {t(FOLDER_ERROR_KEYS[folderError])}
        </Text>
      )}
      {enabled && (
        <>
          <VStack>
            <SettingsSelectRow
              label={t("app.settings.backupSettings.autoBackupFolderLabel")}
              description={t(
                "app.settings.backupSettings.autoBackupFolderDescription",
              )}
              badgeText={
                folderUri
                  ? folderLabel(folderUri)
                  : t("app.settings.backupSettings.autoBackupFolderPick")
              }
              onPress={() => {
                void chooseFolder();
              }}
            />
            {folderError && (
              <Text className="text-orange-400 text-sm pb-4">
                {t(FOLDER_ERROR_KEYS[folderError])}
              </Text>
            )}
            {!folderError && !folderWritable && (
              <Text className="text-orange-400 text-sm pb-4">
                {t("app.settings.backupSettings.autoBackupFolderUnavailable")}
              </Text>
            )}
          </VStack>
          <HStack className="items-center gap-x-4 py-4 justify-between">
            <VStack className="gap-y-2 w-1/2">
              <Heading className="text-white font-normal" size="md">
                {t("app.settings.backupSettings.autoBackupTimeLabel")}
              </Heading>
              <Text className="text-primary-100 text-sm">
                {t("app.settings.backupSettings.autoBackupTimeDescription")}
              </Text>
            </VStack>
            <DateTimePicker
              mode="time"
              value={timeOfDay(minuteOfDay)}
              onChange={(date) => {
                if (!date) return;
                useAppBase
                  .getState()
                  .setAutoBackupMinuteOfDay(
                    date.getHours() * 60 + date.getMinutes(),
                  );
              }}
              format="HH:mm"
            >
              <DateTimePickerTrigger className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 rounded-md px-4 py-2">
                <DateTimePickerInput className="text-md text-white" />
                <DateTimePickerIcon
                  as={ClockIcon}
                  className="text-white mr-2"
                />
              </DateTimePickerTrigger>
            </DateTimePicker>
          </HStack>
          <SettingsStepperRow
            label={t("app.settings.backupSettings.autoBackupKeepLabel")}
            description={t(
              "app.settings.backupSettings.autoBackupKeepDescription",
            )}
            valueText={String(keepCount)}
            onDecrement={() =>
              useAppBase.getState().setAutoBackupKeepCount(keepCount - 1)
            }
            onIncrement={() =>
              useAppBase.getState().setAutoBackupKeepCount(keepCount + 1)
            }
            decrementDisabled={keepCount <= AUTO_BACKUP_KEEP_MIN}
            incrementDisabled={keepCount >= AUTO_BACKUP_KEEP_MAX}
          />
          <SettingsActionRow
            label={t("app.settings.backupSettings.autoBackupNowLabel")}
            description={t(
              "app.settings.backupSettings.autoBackupNowDescription",
            )}
            actionLabel={t("app.settings.backupSettings.autoBackupNowAction")}
            onPress={handleBackUpNow}
            disabled={backingUp || !folderUri}
          />
          <Text className="text-primary-100 text-sm pb-4">
            {t("app.settings.backupSettings.autoBackupPrivacyNotice")}
          </Text>
        </>
      )}
    </VStack>
  );
}
