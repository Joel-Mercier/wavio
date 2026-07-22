import UpdateAvailableDialog from "@/components/update/UpdateAvailableDialog";
import { useAppUpdate } from "@/hooks/useAppUpdate";

// Mounted once in the authenticated app shell. Runs the launch-time update check
// and drives the github-updater dialog. Store builds surface their update via
// the OS overlay, so nothing is rendered for them.
export default function UpdateGate() {
  const { status, update, progress, startDownload, dismiss, isStore } =
    useAppUpdate({ autoCheck: true });

  if (isStore) return null;

  return (
    <UpdateAvailableDialog
      status={status}
      update={update}
      progress={progress}
      onUpdate={startDownload}
      onDismiss={dismiss}
    />
  );
}
