import CircleCheckBig from "lucide-react-native/icons/circle-check-big";
import CircleX from "lucide-react-native/icons/circle-x";
import Download from "lucide-react-native/icons/download";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ConfirmActionDialog from "@/components/settings/ConfirmActionDialog";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import {
  downloadAudiobook,
  removeAudiobookDownload,
} from "@/services/audiobookshelf/downloads";
import useAudiobookDownloadsBase from "@/stores/audiobookDownloads";
import useAudiobookshelf from "@/stores/audiobookshelf";

export default function AudiobookDownloadButton({
  itemId,
  size = 24,
}: {
  itemId: string;
  size?: number;
}) {
  const { t } = useTranslation();
  const [white, emerald, red] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
    "--color-red-500",
  ]) as string[];
  const canDownload = useAudiobookshelf((s) => s.canDownload);
  const download = useAudiobookDownloadsBase((s) => s.downloads[itemId]);
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (!canDownload && !download) return null;

  const done = Object.keys(download?.files ?? {}).length;
  return (
    <>
      {download?.status === "done" ? (
        <FadeOutScaleDown onPress={() => setConfirmRemove(true)}>
          <CircleCheckBig size={size} color={emerald} />
        </FadeOutScaleDown>
      ) : download?.status === "downloading" ||
        download?.status === "queued" ? (
        <FadeOutScaleDown
          onPress={() => setConfirmRemove(true)}
          className="flex-row items-center gap-x-2"
        >
          <Spinner size="small" color={white} />
          {download.totalFiles > 1 && (
            <Text className="text-primary-100 text-sm">
              {`${done}/${download.totalFiles}`}
            </Text>
          )}
        </FadeOutScaleDown>
      ) : download?.status === "failed" ? (
        <FadeOutScaleDown onPress={() => void downloadAudiobook(itemId)}>
          <CircleX size={size} color={red} />
        </FadeOutScaleDown>
      ) : (
        <FadeOutScaleDown onPress={() => void downloadAudiobook(itemId)}>
          <Download size={size} color={white} />
        </FadeOutScaleDown>
      )}
      <ConfirmActionDialog
        isOpen={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={t("app.audiobooks.removeDownloadTitle")}
        description={t("app.audiobooks.removeDownloadDescription")}
        confirmLabel={t("app.shared.delete")}
        cancelLabel={t("app.shared.cancel")}
        confirmVariant="danger"
        onConfirm={() => {
          setConfirmRemove(false);
          removeAudiobookDownload(itemId);
        }}
      />
    </>
  );
}
