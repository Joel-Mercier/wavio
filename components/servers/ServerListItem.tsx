import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import {
  AlertCircleIcon,
  EllipsisVertical,
  Pencil,
  Trash,
  Users as UsersIcon,
} from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
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
import {
  Avatar,
  AvatarFallbackText,
  AvatarGroup,
} from "@/components/ui/avatar";
import { Box } from "@/components/ui/box";
import {
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
} from "@/components/ui/form-control";
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
import { themeConfig } from "@/config/theme";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { useAuthBase } from "@/stores/auth";
import useServers, { type Server, serverFormSchema } from "@/stores/servers";
import { switchToServer } from "@/utils/switchServer";
import { cn } from "@/utils/tailwind";

interface ServerListItemProps {
  server: Server;
}

const MAX_VISIBLE_AVATARS = 4;

export default function ServerListItem({ server }: ServerListItemProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [showAlertDialog, setShowAlertDialog] = useState<boolean>(false);
  const [showEditAlertDialog, setShowEditAlertDialog] =
    useState<boolean>(false);
  const [showManageUsersDialog, setShowManageUsersDialog] =
    useState<boolean>(false);
  const [pendingSwitch, setPendingSwitch] = useState<{
    username?: string;
  } | null>(null);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const toast = useToast();
  const editServer = useServers((store) => store.editServer);
  const removeServer = useServers((store) => store.removeServer);
  const removeUser = useServers((store) => store.removeUser);
  const allUsers = useServers((store) => store.users);
  const users = useMemo(
    () => allUsers.filter((u) => u.serverId === server.id),
    [allUsers, server.id],
  );
  const form = useForm({
    defaultValues: { name: server.name, url: server.url },
    validators: {
      onBlur: serverFormSchema,
    },
    onSubmit: async ({ value }) => {
      editServer(server.id, { name: value.name, url: value.url });
      form.reset();
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.servers.editServerSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
      setShowEditAlertDialog(false);
    },
  });

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);
  const handleCloseEditServerModal = () => setShowEditAlertDialog(false);
  const handleCloseAlertDialog = () => setShowAlertDialog(false);
  const handleCloseManageUsersDialog = () => setShowManageUsersDialog(false);
  const handleDeletePress = () => {
    const wasCurrent = server.current;
    removeServer(server.id);
    if (wasCurrent && useAuthBase.getState().isAuthenticated) {
      useAuthBase.getState().logout();
    }
    setShowAlertDialog(false);
  };

  const handleCardPress = () => {
    setPendingSwitch({});
  };

  const handleAvatarPress = (username: string) => {
    setPendingSwitch({ username });
  };

  const handleConfirmSwitch = () => {
    const target = pendingSwitch;
    setPendingSwitch(null);
    if (target) {
      switchToServer(router, server.id, target.username);
    }
  };

  const handleCancelSwitch = () => setPendingSwitch(null);

  const visibleUsers = users.slice(0, MAX_VISIBLE_AVATARS);
  const overflowCount = users.length - visibleUsers.length;

  return (
    <FadeOutScaleDown className="mb-4" onPress={handleCardPress}>
      <VStack
        className={cn(
          "bg-primary-600 p-4 w-full rounded-md border border-primary-600",
          {
            "border-emerald-500": server.current,
          },
        )}
      >
        <HStack className="items-center justify-between">
          <VStack className="flex-1">
            <Heading
              size="md"
              className="text-white mb-3 flex-1"
              numberOfLines={1}
            >
              {server.name}
            </Heading>
            <Text className="text-primary-100 text-sm mb-3" numberOfLines={1}>
              {server.url}
            </Text>
            {users.length > 0 ? (
              <AvatarGroup>
                {overflowCount > 0 && (
                  <Avatar size="sm" className="bg-primary-400">
                    <AvatarFallbackText>{`+${overflowCount}`}</AvatarFallbackText>
                  </Avatar>
                )}
                {visibleUsers.map((u) => (
                  <FadeOutScaleDown
                    key={`${u.serverId}:${u.username}`}
                    onPress={() => handleAvatarPress(u.username)}
                  >
                    <Avatar size="sm" className="bg-primary-400">
                      <AvatarFallbackText>{u.username}</AvatarFallbackText>
                    </Avatar>
                  </FadeOutScaleDown>
                ))}
              </AvatarGroup>
            ) : null}
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
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.servers.editServer")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() => {
                  bottomSheetModalRef.current?.dismiss();
                  setShowManageUsersDialog(true);
                }}
              >
                <HStack className="items-center">
                  <UsersIcon
                    size={24}
                    color={themeConfig.theme.colors.gray[200]}
                  />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.servers.manageUsers")}
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
                  <Trash size={24} color={themeConfig.theme.colors.gray[200]} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.servers.deleteServer")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
      <AlertDialog
        isOpen={pendingSwitch !== null}
        onClose={handleCancelSwitch}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.servers.switchServerConfirmTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t("app.servers.switchServerConfirmDescription")}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCancelSwitch}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleConfirmSwitch}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.servers.switchConfirm")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        isOpen={showAlertDialog}
        onClose={handleCloseAlertDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.servers.deleteServerConfirmTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t("app.servers.deleteServerConfirmDescription")}
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
        isOpen={showManageUsersDialog}
        onClose={handleCloseManageUsersDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.servers.manageUsers")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            {users.length === 0 ? (
              <Text className="text-primary-50" size="sm">
                {t("app.servers.noUsers")}
              </Text>
            ) : (
              <VStack className="gap-y-3">
                {users.map((u) => (
                  <HStack
                    key={`${u.serverId}:${u.username}`}
                    className="items-center justify-between"
                  >
                    <HStack className="items-center flex-1">
                      <Avatar size="sm" className="bg-primary-400 mr-3">
                        <AvatarFallbackText>{u.username}</AvatarFallbackText>
                      </Avatar>
                      <Text
                        className="text-white text-base flex-1"
                        numberOfLines={1}
                      >
                        {u.username}
                      </Text>
                    </HStack>
                    <FadeOutScaleDown
                      onPress={() => removeUser(u.serverId, u.username)}
                    >
                      <Trash
                        size={20}
                        color={themeConfig.theme.colors.gray[200]}
                      />
                    </FadeOutScaleDown>
                  </HStack>
                ))}
              </VStack>
            )}
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCloseManageUsersDialog}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.close")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        isOpen={showEditAlertDialog}
        onClose={handleCloseEditServerModal}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.servers.editServer")}
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
                  className="my-4"
                >
                  <Input
                    className="bg-primary-600 border-0 rounded-full"
                    variant="rounded"
                    size="xl"
                  >
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={field.handleBlur}
                      className={cn(
                        "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-full",
                        {
                          "border-red-500": !field.state.meta.isValid,
                        },
                      )}
                      placeholder={t("app.servers.namePlaceholder")}
                    />
                  </Input>
                  {!field.state.meta.isValid && (
                    <FormControlError className="items-start">
                      <FormControlErrorIcon
                        as={AlertCircleIcon}
                        className="text-red-500"
                      />
                      <FormControlErrorText className="text-red-500 shrink">
                        {field.state.meta.errors
                          .map((error) => error?.message)
                          .join("\n")}{" "}
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
                  className="my-4"
                >
                  <Input
                    className="bg-primary-600 border-0 rounded-full"
                    variant="rounded"
                    size="xl"
                  >
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={field.handleBlur}
                      className={cn(
                        "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-full",
                        {
                          "border-red-500": !field.state.meta.isValid,
                        },
                      )}
                      placeholder={t("app.servers.urlPlaceholder")}
                      autoCapitalize="none"
                      textContentType="URL"
                    />
                  </Input>
                  {!field.state.meta.isValid && (
                    <FormControlError className="items-start">
                      <FormControlErrorIcon
                        as={AlertCircleIcon}
                        className="text-red-500"
                      />
                      <FormControlErrorText className="text-red-500 shrink">
                        {field.state.meta.errors
                          .map((error) => error?.message)
                          .join("\n")}{" "}
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
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={() => {
                form.state.isDirty ? form.handleSubmit() : undefined;
              }}
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
