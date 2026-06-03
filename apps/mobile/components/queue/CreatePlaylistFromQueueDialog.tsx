import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import { z } from "zod";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { FormControl } from "@/components/ui/form-control";
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

interface CreatePlaylistFromQueueDialogProps {
  isOpen: boolean;
  onClose: () => void;
  trackIds: string[];
}

const createPlaylistSchema = z.object({
  name: z.string().min(1).trim(),
});

export default function CreatePlaylistFromQueueDialog({
  isOpen,
  onClose,
  trackIds,
}: CreatePlaylistFromQueueDialogProps) {
  const [gray400] = Uniwind.getCSSVariable(["--color-gray-400"]) as string[];
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const doCreatePlaylist = useCreatePlaylist();

  const form = useForm({
    defaultValues: { name: "" },
    validators: { onChange: createPlaylistSchema },
    onSubmit: async ({ value }) => {
      doCreatePlaylist.mutate(
        { name: value.name.trim(), songId: trackIds },
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
    },
  });

  useEffect(() => {
    if (isOpen) form.reset();
  }, [isOpen, form]);

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
          <form.Field name="name">
            {(field) => (
              <FormControl
                isInvalid={showFieldError(field)}
                size="md"
                isDisabled={false}
                isReadOnly={false}
                isRequired={false}
              >
                <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                  <InputField
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={() => handleFieldBlur(field)}
                    autoFocus
                    className="text-white text-md"
                    placeholder={t("app.queue.createPlaylistNamePlaceholder")}
                    onSubmitEditing={() => form.handleSubmit()}
                    placeholderTextColor={gray400}
                  />
                </Input>
                <FieldError field={field} />
              </FormControl>
            )}
          </form.Field>
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
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting] as const}
          >
            {([canSubmit, isSubmitting]) => {
              const disabled =
                !canSubmit || isSubmitting || doCreatePlaylist.isPending;
              return (
                <FadeOutScaleDown
                  onPress={disabled ? undefined : () => form.handleSubmit()}
                  disabled={disabled}
                  disabledOpacity={0.5}
                  className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
                >
                  <Text className="text-primary-800 font-bold text-lg">
                    {t("app.shared.create")}
                  </Text>
                </FadeOutScaleDown>
              );
            }}
          </form.Subscribe>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
