import { useForm, useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import Info from "lucide-react-native/dist/esm/icons/info.mjs";
import Pencil from "lucide-react-native/dist/esm/icons/pencil.mjs";
import Trash from "lucide-react-native/dist/esm/icons/trash.mjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import { Uniwind } from "uniwind";
import * as z from "zod";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import UrlInputField from "@/components/forms/UrlInputField";
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
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import {
  useDeleteInternetRadioStation,
  useUpdateInternetRadioStation,
} from "@/hooks/backend/useInternetRadioStations";
import { cn } from "@/utils/tailwind";

const updateInternetRadioStationSchema = z.object({
  name: z.string().min(1),
  streamUrl: z.url(),
  homePageUrl: z.url().optional(),
});

interface Props {
  id: string;
  name: string;
  streamUrl: string;
  homePageUrl?: string;
  onActionStart?: () => void;
  onDeleted?: () => void;
}

export default function InternetRadioStationActions({
  id,
  name,
  streamUrl,
  homePageUrl,
  onActionStart,
  onDeleted,
}: Props) {
  const [gray200] = Uniwind.getCSSVariable(["--color-gray-200"]) as string[];
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const doDeleteInternetRadioStation = useDeleteInternetRadioStation();
  const doUpdateInternetRadioStation = useUpdateInternetRadioStation();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const form = useForm({
    defaultValues: {
      name,
      streamUrl,
      homePageUrl,
    } as z.input<typeof updateInternetRadioStationSchema>,
    validators: { onChange: updateInternetRadioStationSchema },
    onSubmit: async ({ value }) => {
      doUpdateInternetRadioStation.mutate(
        { id, ...value },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: ["internet_radio_stations"],
            });
            setShowEditDialog(false);
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="success">
                  <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                  <ToastDescription>
                    {t(
                      "app.internetRadioStations.editInternetRadioStationSuccessMessage",
                    )}
                  </ToastDescription>
                </Toast>
              ),
            });
          },
          onError: () => {
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="error">
                  <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                  <ToastDescription>
                    {t(
                      "app.internetRadioStations.editInternetRadioStationErrorMessage",
                    )}
                  </ToastDescription>
                </Toast>
              ),
            });
          },
        },
      );
    },
  });

  const [isDirty, isSubmitting] = useStore(form.store, (state) => [
    state.isDirty,
    state.isSubmitting,
  ]);

  const handleVisitHomePagePress = async () => {
    onActionStart?.();
    if (homePageUrl && (await Linking.canOpenURL(homePageUrl))) {
      Linking.openURL(homePageUrl);
    }
  };

  const handleEditPress = () => {
    onActionStart?.();
    setShowEditDialog(true);
  };

  const handleDeletePress = () => {
    onActionStart?.();
    doDeleteInternetRadioStation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ["internet_radio_stations"],
          });
          onDeleted?.();
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t(
                    "app.internetRadioStations.deleteInternetRadioStationSuccessMessage",
                  )}
                </ToastDescription>
              </Toast>
            ),
          });
        },
        onError: () => {
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t(
                    "app.internetRadioStations.deleteInternetRadioStationErrorMessage",
                  )}
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  return (
    <>
      <VStack className="mt-6 gap-y-8">
        {homePageUrl && (
          <FadeOutScaleDown onPress={handleVisitHomePagePress}>
            <HStack className="items-center">
              <Info size={24} color={gray200} />
              <Text className="ml-4 text-lg text-gray-200">
                {t("app.internetRadioStations.visitHomePage")}
              </Text>
            </HStack>
          </FadeOutScaleDown>
        )}
        <FadeOutScaleDown onPress={handleEditPress}>
          <HStack className="items-center">
            <Pencil size={24} color={gray200} />
            <Text className="ml-4 text-lg text-gray-200">
              {t("app.internetRadioStations.editInternetRadioStation")}
            </Text>
          </HStack>
        </FadeOutScaleDown>
        <FadeOutScaleDown onPress={() => setShowDeleteDialog(true)}>
          <HStack className="items-center">
            <Trash size={24} color={gray200} />
            <Text className="ml-4 text-lg text-gray-200">
              {t("app.internetRadioStations.deleteInternetRadioStation")}
            </Text>
          </HStack>
        </FadeOutScaleDown>
      </VStack>
      <AlertDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t(
                "app.internetRadioStations.deleteInternetRadioStationConfirmTitle",
              )}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t(
                "app.internetRadioStations.deleteInternetRadioStationConfirmDescription",
              )}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={() => setShowDeleteDialog(false)}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={() => {
                setShowDeleteDialog(false);
                handleDeletePress();
              }}
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
        isOpen={showEditDialog}
        onClose={() => setShowEditDialog(false)}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t(
                "app.internetRadioStations.editInternetRadioStationModalTitle",
              )}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <form.Field name="name">
              {(field) => (
                <FormControl
                  isInvalid={showFieldError(field)}
                  size="md"
                  className="my-4"
                >
                  <Input className="bg-primary-600 border-0 rounded-full">
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={() => handleFieldBlur(field)}
                      className={cn(
                        "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-full",
                        { "border-red-500": showFieldError(field) },
                      )}
                      placeholder={t(
                        "app.internetRadioStations.namePlaceholder",
                      )}
                    />
                  </Input>
                  <FieldError field={field} />
                </FormControl>
              )}
            </form.Field>
            <form.Field name="streamUrl">
              {(field) => (
                <FormControl
                  isInvalid={showFieldError(field)}
                  size="md"
                  className="my-4"
                >
                  <Input className="bg-primary-600 border-0 rounded-full">
                    <UrlInputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={() => handleFieldBlur(field)}
                      className={cn(
                        "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-full",
                        { "border-red-500": showFieldError(field) },
                      )}
                      placeholder={t(
                        "app.internetRadioStations.streamUrlPlaceholder",
                      )}
                    />
                  </Input>
                  <FieldError field={field} />
                </FormControl>
              )}
            </form.Field>
            <form.Field name="homePageUrl">
              {(field) => (
                <FormControl
                  isInvalid={showFieldError(field)}
                  size="md"
                  className="my-4"
                >
                  <Input className="bg-primary-600 border-0 rounded-full">
                    <UrlInputField
                      value={field.state.value ?? ""}
                      onChangeText={field.handleChange}
                      onBlur={() => handleFieldBlur(field)}
                      className={cn(
                        "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-full",
                        { "border-red-500": showFieldError(field) },
                      )}
                      placeholder={t(
                        "app.internetRadioStations.homePageUrlPlaceholder",
                      )}
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
                setShowEditDialog(false);
              }}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={isDirty && !isSubmitting ? form.handleSubmit : undefined}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4 opacity-65"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.save")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
