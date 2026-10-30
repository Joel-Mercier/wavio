import { useState } from "react";
import { useTranslation } from "react-i18next";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { SettingsToggleRow } from "@/components/settings/SettingsRows";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Heading } from "@/components/ui/heading";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { useDeleteAudiobook } from "@/hooks/audiobookshelf/useAudiobookshelf";
import { removeAudiobookDownload } from "@/services/audiobookshelf/downloads";
import useAudiobookshelf from "@/stores/audiobookshelf";
import { TOAST_DURATION } from "@/utils/toastDuration";

// Removing a book from the library leaves its files where they are (the next
// scan finds it again); deleting the files too is the destructive variant.
export default function AudiobookDeleteDialog({
  isOpen,
  onClose,
  itemId,
  title,
  onDeleted,
}: {
  isOpen: boolean;
  onClose: () => void;
  itemId: string;
  title: string;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [deleteFiles, setDeleteFiles] = useState(false);
  const removeFavorite = useAudiobookshelf((s) => s.removeFavorite);
  const { mutate, isPending } = useDeleteAudiobook();

  const handleConfirm = () => {
    mutate(
      { itemId, deleteFiles },
      {
        onSuccess: () => {
          removeFavorite("book", itemId);
          removeAudiobookDownload(itemId);
          onClose();
          onDeleted();
        },
        onError: () => {
          toast.show({
            placement: "top",
            duration: TOAST_DURATION.default,
            render: () => (
              <Toast action="error">
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.audiobooks.deleteErrorMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  return (
    <AlertDialog isOpen={isOpen} onClose={onClose} size="md">
      <AlertDialogBackdrop />
      <AlertDialogContent className="bg-primary-800 border-primary-400">
        <AlertDialogHeader>
          <Heading className="text-white font-bold" size="md">
            {t("app.audiobooks.deleteTitle")}
          </Heading>
        </AlertDialogHeader>
        <AlertDialogBody className="mt-3 mb-2">
          <Text className="text-primary-50" size="sm">
            {t("app.audiobooks.deleteDescription", { title })}
          </Text>
          <SettingsToggleRow
            label={t("app.audiobooks.deleteFilesLabel")}
            description={t("app.audiobooks.deleteFilesDescription")}
            value={deleteFiles}
            onToggle={setDeleteFiles}
          />
        </AlertDialogBody>
        <AlertDialogFooter className="items-center justify-center">
          <FadeOutScaleDown
            onPress={onClose}
            className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
          >
            <Text className="text-white font-bold text-lg">
              {t("app.shared.cancel")}
            </Text>
          </FadeOutScaleDown>
          <FadeOutScaleDown
            onPress={handleConfirm}
            disabled={isPending}
            className="items-center justify-center py-3 px-8 border rounded-full border-red-500 bg-red-500 ml-4"
          >
            {isPending ? (
              <Spinner color="rgb(41, 41, 41)" />
            ) : (
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.delete")}
              </Text>
            )}
          </FadeOutScaleDown>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
