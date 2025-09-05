import { ExternalLink } from "@/components/ExternalLink";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
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
import {
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
} from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Input, InputField } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea, TextareaInput } from "@/components/ui/textarea";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import {
  useDeleteShare,
  useUpdateShare,
} from "@/hooks/openSubsonic/useSharing";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import type { Share } from "@/services/openSubsonic/types";
import { artworkUrl } from "@/utils/artwork";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useForm } from "@tanstack/react-form";
import {
  AlertCircleIcon,
  AudioLines,
  Disc3,
  EllipsisVertical,
  Pencil,
  Trash,
} from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import z from "zod";

const updateShareSchema = z.object({
  description: z.string().optional(),
  expires: z.string().optional(),
});

export default function ShareListItem({ share }: { share: Share }) {
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
    },
    validators: {
      onChange: updateShareSchema,
    },
    onSubmit: async ({ value }) => {
      doUpdateShare.mutate(
        {
          id: share.id,
          description: value.description,
          expires: value.expires,
        },
        {
          onSuccess: () => {
            setShowEditAlertDialog(false);
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="success">
                  <ToastDescription>
                    Share successfully updated
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
                  <ToastDescription>
                    An error occurred while updating the share
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
                <ToastDescription>Share successfully deleted</ToastDescription>
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
                <ToastDescription>
                  An error occurred while deleting the share
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const isPlaylist = (share?.entry?.length || 0) > 1;
  const hasEntries = (share?.entry?.length || 0) > 0;
  return (
    <ExternalLink href={share.url}>
      <Card
        size="md"
        variant="ghost"
        className="rounded-md w-full p-0 pb-4 border-b-white"
      >
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
                  <Disc3 size={24} color={themeConfig.theme.colors.white} />
                ) : (
                  <AudioLines
                    size={24}
                    color={themeConfig.theme.colors.white}
                  />
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
                    ? "Playlist"
                    : hasEntries && share?.entry
                      ? share.entry[0].mediaType
                      : "Unknown"}
                </Text>
                <Text className="text-md text-primary-100">
                  {` ⦁ ${share.visitCount} ${share.visitCount > 1 ? "visits" : "visit"}`}
                </Text>
              </HStack>
            </VStack>
          </HStack>
          <FadeOutScaleDown onPress={handlePresentModalPress}>
            <EllipsisVertical color={themeConfig.theme.colors.gray[300]} />
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
            <VStack className="mt-6 gap-y-8">
              <FadeOutScaleDown
                onPress={() => {
                  bottomSheetModalRef.current?.dismiss();
                  setShowEditAlertDialog(true);
                }}
              >
                <HStack className="items-center">
                  <Pencil
                    size={24}
                    color={themeConfig.theme.colors.gray[200]}
                  />
                  <Text className="ml-4 text-lg text-gray-200">Edit share</Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() => {
                  bottomSheetModalRef.current?.dismiss();
                  setShowAlertDialog(true);
                }}
              >
                <HStack className="items-center">
                  <Trash size={24} color={themeConfig.theme.colors.gray[200]} />
                  <Text className="ml-4 text-lg text-gray-200">
                    Delete share
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
              Are you sure you want to delete this share?
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              Deleting the share will remove it permanently and will prevent
              others from accessing the shared sounds. Please confirm if you
              want to proceed.
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCloseAlertDialog}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">Cancel</Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleDeletePress}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">Delete</Text>
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
              Edit share
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <form.Field name="description">
              {(field) => (
                <FormControl
                  isInvalid={!field.state.meta.isValid}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Textarea className="border-0 border-b border-b-white text-white">
                    <TextareaInput
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={field.handleBlur}
                      className="text-md font-normal color-white"
                      placeholder="Description (displayed in the link preview)"
                    />
                  </Textarea>
                  {!field.state.meta.isValid && (
                    <FormControlError>
                      <FormControlErrorIcon
                        as={AlertCircleIcon}
                        className="text-red-500"
                      />
                      <FormControlErrorText className="text-red-500">
                        {field.state.meta.errors.join(", ")}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>
              )}
            </form.Field>
            <form.Field name="expires">
              {(field) => (
                <FormControl
                  isInvalid={!field.state.meta.isValid}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Input
                    className="border-white my-6 h-16"
                    variant="underlined"
                  >
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={field.handleBlur}
                      className="text-md text-white font-bold"
                      placeholder="Expires"
                    />
                  </Input>
                  {!field.state.meta.isValid && (
                    <FormControlError>
                      <FormControlErrorIcon
                        as={AlertCircleIcon}
                        className="text-red-500"
                      />
                      <FormControlErrorText className="text-red-500">
                        {field.state.meta.errors.join(", ")}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>
              )}
            </form.Field>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCloseEditAlertDialog}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">Cancel</Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={form.state.isDirty ? form.handleSubmit : undefined}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">Save</Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ExternalLink>
  );
}
