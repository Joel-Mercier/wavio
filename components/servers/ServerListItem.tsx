import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useServers, { serverSchema, type Server } from "@/stores/servers";
import { cn } from "@/utils/tailwind";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useForm } from "@tanstack/react-form";
import {
  AlertCircleIcon,
  EllipsisVertical,
  Pencil,
  Trash,
} from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "../ui/alert-dialog";
import { Box } from "../ui/box";
import {
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
} from "../ui/form-control";
import { Input, InputField } from "../ui/input";
import { Toast, ToastDescription, useToast } from "../ui/toast";

interface ServerListItemProps {
  server: Server;
}

export default function ServerListItem({ server }: ServerListItemProps) {
  const [showEditAlertDialog, setShowEditAlertDialog] =
    useState<boolean>(false);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const toast = useToast();
  const editServer = useServers.use.editServer();
  const removeServer = useServers.use.removeServer();
  const setCurrentServer = useServers.use.setCurrentServer();
  const form = useForm({
    defaultValues: server,
    validators: {
      onBlur: serverSchema,
    },
    onSubmit: async ({ value }) => {
      editServer({
        ...value,
        current: false,
      });
      form.reset();
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastDescription>Server successfully updated</ToastDescription>
          </Toast>
        ),
      });
      setShowEditAlertDialog(false);
    },
  });
  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);
  const handleCloseEditServerModal = () => {
    setShowEditAlertDialog(false);
  };
  console.log("SERVER", server);
  return (
    <FadeOutScaleDown
      className="mb-4"
      onPress={() => setCurrentServer(server.name)}
    >
      <VStack
        className={cn(
          "bg-primary-600 p-4 w-full rounded-md border border-primary-600",
          {
            "border-emerald-500": server.current,
          },
        )}
      >
        <HStack className="items-center justify-between">
          <VStack>
            <Heading size="md" className="text-white mb-8" numberOfLines={1}>
              {server.name}
            </Heading>
            <HStack>
              <Text className="text-primary-100 text-sm" numberOfLines={1}>
                {server.url}
              </Text>
              <Text className="text-primary-100 text-sm"> ⦁ </Text>
              <Text className="text-primary-100 text-sm">
                {server.username}
              </Text>
            </HStack>
          </VStack>
          <FadeOutScaleDown onPress={handlePresentModalPress}>
            <EllipsisVertical color={themeConfig.theme.colors.gray[300]} />
          </FadeOutScaleDown>
        </HStack>
      </VStack>
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
          <Box className="p-6 w-full pb-12">
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
                  <Text className="ml-4 text-lg text-gray-200">
                    Edit server
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() => {
                  bottomSheetModalRef.current?.dismiss();
                  removeServer(server.name);
                }}
              >
                <HStack className="items-center">
                  <Trash size={24} color={themeConfig.theme.colors.gray[200]} />
                  <Text className="ml-4 text-lg text-gray-200">
                    Delete server
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
      <AlertDialog
        isOpen={showEditAlertDialog}
        onClose={handleCloseEditServerModal}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              Edit server
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <form.Field name="name">
              {(field) => (
                <FormControl
                  isInvalid={!field.state.meta.isValid}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
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
                      placeholder="Enter server name"
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
            <form.Field name="url">
              {(field) => (
                <FormControl
                  isInvalid={!field.state.meta.isValid}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
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
                      placeholder="Enter server url"
                      keyboardType="url"
                      autoCapitalize="none"
                      textContentType="URL"
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
            <form.Field name="username">
              {(field) => (
                <FormControl
                  isInvalid={!field.state.meta.isValid}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
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
                      placeholder="Enter server username"
                      autoCapitalize="none"
                      textContentType="username"
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
            <form.Field name="password">
              {(field) => (
                <FormControl
                  isInvalid={!field.state.meta.isValid}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
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
                      placeholder="Enter user password"
                      secureTextEntry
                      autoCapitalize="none"
                      textContentType="password"
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
              onPress={handleCloseEditServerModal}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">Cancel</Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={() => {
                form.state.isDirty ? form.handleSubmit() : undefined;
              }}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">Save</Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FadeOutScaleDown>
  );
}
