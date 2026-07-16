import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as z from "zod";
import ConfirmActionDialog from "@/components/settings/ConfirmActionDialog";
import { SettingsActionRow } from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { VStack } from "@/components/ui/vstack";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { exportBackup, pickBackupFile, restoreBackup } from "@/services/backup";
import { useAuthBase } from "@/stores/auth";
import { logError } from "@/utils/log";
import { switchToServer } from "@/utils/switchServer";

export default function BackupRestoreSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [showRestoreConfirmAlertDialog, setShowRestoreConfirmAlertDialog] =
    useState(false);
  const [showRestartRequiredAlertDialog, setShowRestartRequiredAlertDialog] =
    useState(false);
  const [restoreTarget, setRestoreTarget] = useState<{
    serverId: string | null;
    username: string | null;
  } | null>(null);

  const handleExportBackupPress = async () => {
    try {
      await exportBackup();
      showSuccessToast(t("app.settings.backupSettings.exportSuccessMessage"));
    } catch (error) {
      logError(error);
      showErrorToast(t("app.settings.backupSettings.exportErrorMessage"));
    }
  };

  // Finishing a restore re-routes through the logout → re-login flow so React
  // Query and the per-account stores are rebuilt cleanly for the restored
  // server, instead of being hot-swapped in place (which mixes content).
  const handleFinishRestore = () => {
    setShowRestartRequiredAlertDialog(false);
    const target = restoreTarget;
    setRestoreTarget(null);
    if (target?.serverId) {
      switchToServer(router, target.serverId, target.username ?? undefined);
    } else {
      useAuthBase.getState().logout();
      router.replace("/(auth)/login");
    }
  };

  const handleConfirmRestoreBackupPress = async () => {
    setShowRestoreConfirmAlertDialog(false);
    try {
      const backup = await pickBackupFile();
      if (!backup) return;
      const outcome = await restoreBackup(backup);
      setRestoreTarget(outcome);
      setShowRestartRequiredAlertDialog(true);
    } catch (error) {
      logError(error);
      const isValidationError = error instanceof z.ZodError;
      showErrorToast(
        t(
          isValidationError
            ? "app.settings.backupSettings.restoreInvalidFileMessage"
            : "app.settings.backupSettings.restoreErrorMessage",
        ),
      );
    }
  };

  return (
    <SettingsScreenScaffold
      title={t("app.settings.menu.backup.title")}
      overlays={
        <>
          <ConfirmActionDialog
            isOpen={showRestoreConfirmAlertDialog}
            onClose={() => setShowRestoreConfirmAlertDialog(false)}
            title={t("app.settings.backupSettings.restoreConfirmTitle")}
            description={t(
              "app.settings.backupSettings.restoreConfirmDescription",
            )}
            cancelLabel={t("app.shared.cancel")}
            confirmLabel={t("app.settings.backupSettings.restoreAction")}
            confirmVariant="danger"
            onConfirm={handleConfirmRestoreBackupPress}
          />
          <ConfirmActionDialog
            isOpen={showRestartRequiredAlertDialog}
            onClose={() => setShowRestartRequiredAlertDialog(false)}
            title={t("app.settings.backupSettings.restartRequiredTitle")}
            description={t(
              "app.settings.backupSettings.restartRequiredDescription",
            )}
            confirmLabel={t(
              "app.settings.backupSettings.restartRequiredAction",
            )}
            onConfirm={handleFinishRestore}
          />
        </>
      }
    >
      <VStack className="gap-y-4">
        <SettingsActionRow
          label={t("app.settings.backupSettings.exportLabel")}
          description={t("app.settings.backupSettings.exportDescription")}
          actionLabel={t("app.settings.backupSettings.exportAction")}
          onPress={handleExportBackupPress}
        />
        <SettingsActionRow
          variant="danger"
          label={t("app.settings.backupSettings.restoreLabel")}
          description={t("app.settings.backupSettings.restoreDescription")}
          actionLabel={t("app.settings.backupSettings.restoreAction")}
          onPress={() => setShowRestoreConfirmAlertDialog(true)}
        />
      </VStack>
    </SettingsScreenScaffold>
  );
}
