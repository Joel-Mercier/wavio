import { useTranslation } from "react-i18next";
import ConfirmActionDialog from "@/components/settings/ConfirmActionDialog";
import { useCollectionDownloadedCount } from "@/hooks/offline/useCollectionDownload";

export default function RemoveDownloadsDialog({
  isOpen,
  onClose,
  onConfirm,
  trackedIds,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  trackedIds: string[] | undefined;
}) {
  const { t } = useTranslation();
  const count = useCollectionDownloadedCount(trackedIds);
  return (
    <ConfirmActionDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={t("app.shared.offline.removeConfirmTitle")}
      description={t("app.shared.offline.removeConfirmDescription", { count })}
      confirmLabel={t("app.shared.offline.removeConfirmAction")}
      cancelLabel={t("app.shared.cancel")}
      confirmVariant="danger"
    />
  );
}
