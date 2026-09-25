import { useTranslation } from "react-i18next";
import ConfirmActionDialog from "@/components/settings/ConfirmActionDialog";

export default function RemoveDownloadsDialog({
  isOpen,
  onClose,
  onConfirm,
  count,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  count: number;
}) {
  const { t } = useTranslation();
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
