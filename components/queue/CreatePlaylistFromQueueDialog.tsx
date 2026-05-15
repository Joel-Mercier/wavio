import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Heading } from "@/components/ui/heading";
import { Input, InputField } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { useCreatePlaylist } from "@/hooks/backend/usePlaylists";
import { cn } from "@/utils/tailwind";

interface CreatePlaylistFromQueueDialogProps {
  isOpen: boolean;
  onClose: () => void;
  trackIds: string[];
}

export default function CreatePlaylistFromQueueDialog({
  isOpen,
  onClose,
  trackIds,
}: CreatePlaylistFromQueueDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const doCreatePlaylist = useCreatePlaylist();
  const [name, setName] = useState("");

  useEffect(() => {
    if (isOpen) setName("");
  }, [isOpen]);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    doCreatePlaylist.mutate(
      { name: trimmed, songId: trackIds },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["playlists"] });
          onClose();
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.queue.createPlaylistSuccessMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
        onError: (error) => {
          console.error(error);
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.queue.createPlaylistErrorMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const canSubmit = name.trim().length > 0 && !doCreatePlaylist.isPending;

  return (
    <AlertDialog isOpen={isOpen} onClose={onClose} size="md">
      <AlertDialogBackdrop />
      <AlertDialogContent className="bg-primary-800 border-primary-400">
        <AlertDialogHeader>
          <Heading className="text-white font-bold" size="md">
            {t("app.queue.createPlaylistTitle")}
          </Heading>
        </AlertDialogHeader>
        <AlertDialogBody className="mt-3 mb-4">
          <Input className="border-white">
            <InputField
              value={name}
              onChangeText={setName}
              autoFocus
              className="text-white placeholder:text-gray-400"
              placeholder={t("app.queue.createPlaylistNamePlaceholder")}
              onSubmitEditing={handleCreate}
            />
          </Input>
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
            onPress={canSubmit ? handleCreate : undefined}
            disabled={!canSubmit}
            className={cn(
              "items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4",
              { "opacity-50": !canSubmit },
            )}
          >
            <Text className="text-primary-800 font-bold text-lg">
              {t("app.shared.create")}
            </Text>
          </FadeOutScaleDown>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
