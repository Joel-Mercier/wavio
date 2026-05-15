import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useForm } from "@tanstack/react-form";
import * as Clipboard from "expo-clipboard";
import { openBrowserAsync } from "expo-web-browser";
import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import ClipboardCheck from "lucide-react-native/dist/esm/icons/clipboard-check.mjs";
import ClipboardIcon from "lucide-react-native/dist/esm/icons/clipboard.mjs";
import Disc3 from "lucide-react-native/dist/esm/icons/disc-3.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Pencil from "lucide-react-native/dist/esm/icons/pencil.mjs";
import Trash from "lucide-react-native/dist/esm/icons/trash.mjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { Uniwind } from "uniwind";
import * as z from "zod";
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
import { Box } from "@/components/ui/box";
import { Card } from "@/components/ui/card";
import { FormControl } from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Input, InputField } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea, TextareaInput } from "@/components/ui/textarea";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import {
  useDeleteShare,
  useUpdateShare,
} from "@/hooks/backend/useSharing";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import type { Share } from "@/services/openSubsonic/types";
import { artworkUrl } from "@/utils/artwork";
import { cn } from "@/utils/tailwind";

const updateShareSchema = z.object({
  description: z.string().trim().optional(),
  expires: z.string().trim().optional(),
});

export default function ShareListItem({ share }: { share: Share }) {
  const [white, gray300, emerald500, gray200] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-300",
    "--color-emerald-500",
    "--color-gray-200",
  ]) as string[];
  const { t } = useTranslation();
  const [clipoardCopyDone, setClipoardCopyDone] = useState<boolean>(false);
  const [showAlertDialog, setShowAlertDialog] = useState<boolean>(false);
  const [showEditAlertDialog, setShowEditAlertDialog] =
    useState<boolean>(false);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const doDeleteShare = useDeleteShare();
  const doUpdateShare = useUpdateShare();
  const toast = useToast();
  const form = useForm({
    defaultValues: {
      description: share.description,
      expires: share.expires as unknown as string,
    } as z.input<typeof updateShareSchema>,
    validators: {
      onChange: updateShareSchema,
    },
    onSubmit: async ({ value }) => {
      doUpdateShare.mutate(
        {
          id: share.id,
          description: value.description,
          expires: value.expires as unknown as number | undefined,
        },
        {
          onSuccess: () => {
            setShowEditAlertDialog(false);
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="success">
                  <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                  <ToastDescription>
                    {t("app.shares.editShareSuccessMessage")}
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
                    {t("app.shares.editShareErrorMessage")}
                  </ToastDescription>
                </Toast>
              ),
            });
          },
        },
      );
    },
  });

  const handleCloseAlertDialog = () => setShowAlertDialog(false);

  const handleCloseEditAlertDialog = () => setShowEditAlertDialog(false);

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleDeletePress = () => {
    doDeleteShare.mutate(
      { id: share.id },
      {
        onSuccess: () => {
          bottomSheetModalRef.current?.dismiss();
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.shares.deleteShareSuccessMessage")}
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
                  {t("app.shares.deleteShareErrorMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  useEffect(() => {
    if (clipoardCopyDone) {
      const timer = setTimeout(() => {
        setClipoardCopyDone(false);
      }, 1000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [clipoardCopyDone]);

  const handleCopyShareUrlPress = async () => {
    try {
      await Clipboard.setStringAsync(share.url);
      setClipoardCopyDone(true);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.shared.shareUrlCopiedMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    } catch (e) {
      console.error(e);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.shared.shareUrlErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  const handleSharePress = async () => {
    if (Platform.OS !== "web") {
      // Open the link in an in-app browser.
      await openBrowserAsync(share.url);
    }
  };

  const isPlaylist = (share?.entry?.length || 0) > 1;
  const hasEntries = (share?.entry?.length || 0) > 0;
  return (
    <FadeOutScaleDown onPress={handleSharePress} className="mb-4">
      <Card className="w-full p-4 rounded-md bg-primary-600">
        <HStack className="items-center justify-between">
          <HStack className="items-center">
            {share?.entry && hasEntries && share?.entry[0]?.coverArt ? (
              <Image
                source={{ uri: artworkUrl(share.entry[0].coverArt) }}
                className="w-16 h-16 rounded-md aspect-square"
                alt="Share cover"
              />
            ) : (
              <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                {share?.entry &&
                hasEntries &&
                share.entry[0].mediaType === "album" ? (
                  <Disc3 size={24} color={white} />
                ) : (
                  <AudioLines size={24} color={white} />
                )}
              </Box>
            )}
            <VStack className="ml-4">
              <Heading size="lg" className="text-white" numberOfLines={1}>
                {isPlaylist
                  ? share.description
                  : hasEntries && share?.entry
                    ? share.entry[0].name || share.entry[0].title
                    : "No description"}
              </Heading>
              <HStack>
                <Text className="text-md text-primary-100 capitalize">
                  {isPlaylist
                    ? t("app.shared.playlist_one")
                    : hasEntries && share?.entry && share.entry[0].mediaType
                      ? t(`app.shares.mediaType_${share.entry[0].mediaType}`, {
                          defaultValue: share.entry[0].mediaType,
                        })
                      : t("app.shared.unknown")}
                </Text>
                <Text className="text-md text-primary-100">
                  {` ⦁ ${t("app.shares.visitCount", { count: share.visitCount })}`}
                </Text>
              </HStack>
            </VStack>
          </HStack>
          <FadeOutScaleDown onPress={handlePresentModalPress}>
            <EllipsisVertical color={gray300} />
          </FadeOutScaleDown>
        </HStack>
      </Card>
      <BottomSheetModal
        ref={bottomSheetModalRef}
        onChange={handleSheetPositionChange}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView
          style={{
            flex: 1,
            alignItems: "center",
          }}
        >
          <Box className="p-6 w-full mb-12">
            <HStack className="items-center">
              <FadeOutScaleDown
                className="flex-row gap-x-4 items-center justify-between flex-1  overflow-hidden"
                onPress={handleCopyShareUrlPress}
              >
                {clipoardCopyDone ? (
                  <ClipboardCheck size={24} color={emerald500} />
                ) : (
                  <ClipboardIcon size={24} color={gray200} />
                )}
                <Text
                  className="text-lg text-gray-200 py-1 px-3 bg-primary-900 rounded-xl  flex-1 grow"
                  ellipsizeMode="tail"
                  numberOfLines={1}
                >
                  {share.url}
                </Text>
              </FadeOutScaleDown>
            </HStack>
            <VStack className="mt-6 gap-y-8">
              <FadeOutScaleDown
                onPress={() => {
                  bottomSheetModalRef.current?.dismiss();
                  setShowEditAlertDialog(true);
                }}
              >
                <HStack className="items-center">
                  <Pencil size={24} color={gray200} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.shares.editShare")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() => {
                  bottomSheetModalRef.current?.dismiss();
                  setShowAlertDialog(true);
                }}
              >
                <HStack className="items-center">
                  <Trash size={24} color={gray200} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.shares.deleteShare")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
      <AlertDialog
        isOpen={showAlertDialog}
        onClose={handleCloseAlertDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.shares.deleteShareConfirmTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t("app.shares.deleteShareConfirmDescription")}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCloseAlertDialog}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleDeletePress}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.delete")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        isOpen={showEditAlertDialog}
        onClose={handleCloseEditAlertDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.shares.editShareModalTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <form.Field name="description">
              {(field) => (
                <FormControl
                  isInvalid={showFieldError(field)}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Textarea
                    className="bg-primary-600 border-0 rounded-md"
                    size="xl"
                  >
                    <TextareaInput
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={() => handleFieldBlur(field)}
                      className={cn(
                        "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-lg",
                        {
                          "border-red-500": showFieldError(field),
                        },
                      )}
                      placeholder={t("app.shares.descriptionPlaceholder")}
                    />
                  </Textarea>
                  <FieldError field={field} />
                </FormControl>
              )}
            </form.Field>
            <form.Field name="expires">
              {(field) => (
                <FormControl
                  isInvalid={showFieldError(field)}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={() => handleFieldBlur(field)}
                      className="text-md text-white"
                      placeholder={t("app.shares.expiresPlaceholder")}
                    />
                  </Input>
                  <FieldError field={field} />
                </FormControl>
              )}
            </form.Field>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={() => {
                form.reset();
                handleCloseEditAlertDialog();
              }}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={form.state.isDirty ? form.handleSubmit : undefined}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.save")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FadeOutScaleDown>
  );
}
