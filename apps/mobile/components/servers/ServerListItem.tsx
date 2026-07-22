import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useForm, useStore } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Pencil from "lucide-react-native/dist/esm/icons/pencil.mjs";
import Trash from "lucide-react-native/dist/esm/icons/trash.mjs";
import UsersIcon from "lucide-react-native/dist/esm/icons/users.mjs";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import AdvancedSettingsSection from "@/components/forms/AdvancedSettingsSection";
import ClientCertificateField from "@/components/forms/ClientCertificateField";
import FallbackUrlField from "@/components/forms/FallbackUrlField";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import LocalPathsField from "@/components/forms/LocalPathsField";
import UrlInputField from "@/components/forms/UrlInputField";
import ServerTypeIcon from "@/components/ServerTypeIcon";
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
import { LOCAL_AUTH_SCOPE } from "@/config/authScope";
import { createScopedStorage } from "@/config/storage";
import { hostnameFromUrl, isSslTrustAvailable } from "@/modules/ssl-trust";
import { foldersRemoved } from "@/services/local/paths";
import { syncSslClientCertificates, syncSslProxy } from "@/services/sslTrust";
import { useAuthBase } from "@/stores/auth";
import useLocalLibrary from "@/stores/localLibrary";
import useRecentPlays from "@/stores/recentPlays";
import useServers, {
  editServerFormSchema,
  type Server,
} from "@/stores/servers";
import { switchToServer } from "@/utils/switchServer";
import { cn } from "@/utils/tailwind";

interface ServerListItemProps {
  server: Server;
}

const MAX_VISIBLE_AVATARS = 4;

export default function ServerListItem({ server }: ServerListItemProps) {
  const [gray300, gray200] = Uniwind.getCSSVariable([
    "--color-gray-300",
    "--color-gray-200",
  ]) as string[];
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
    defaultValues: {
      name: server.name,
      url: server.url,
      type: server.type,
      paths: server.paths ?? [],
      mtlsAlias: server.mtlsAlias ?? "",
      fallbackUrl: server.fallbackUrl ?? "",
    },
    validators: {
      onChange: editServerFormSchema,
    },
    onSubmit: async ({ value }) => {
      if (value.type === "local") {
        const removed = foldersRemoved(server.paths ?? [], value.paths ?? []);
        editServer(server.id, { paths: value.paths });
        // Folders changed: re-open the indexing gate (incremental) so added
        // folders get indexed and removed ones pruned without a manual rescan.
        useLocalLibrary.getState().requestRescan(false);
        // A dropped folder prunes its albums, so home shortcuts pointing at them
        // would go stale — clear them (favourites shortcut is kept).
        if (removed) useRecentPlays.getState().clearRecentPlays();
      } else {
        editServer(server.id, {
          name: value.name,
          url: value.url,
          type: value.type,
          mtlsAlias: value.mtlsAlias?.trim() || undefined,
          fallbackUrl: value.fallbackUrl ?? "",
        });
        // Refresh the native KeyManager so the updated client cert applies, and
        // register the (possibly new) fallback origin with the iOS proxy —
        // otherwise it wouldn't be an upstream until the next cold start.
        await syncSslClientCertificates();
        await syncSslProxy();
      }
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

  const isDirty = useStore(form.store, (state) => state.isDirty);

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);
  const handleCloseEditServerModal = () => setShowEditAlertDialog(false);
  const handleCloseAlertDialog = () => setShowAlertDialog(false);
  const handleCloseManageUsersDialog = () => setShowManageUsersDialog(false);
  const handleDeletePress = () => {
    const wasCurrent = server.current;
    // The local library's on-device data is keyed on a fixed sentinel scope, so
    // a re-added local server would otherwise inherit the deleted one's scan
    // stamp, favourites and home shortcuts. Clear the scoped stores so a re-add
    // re-runs the indexing gate; the stale SQLite rows are pruned by that scan
    // (deleting the DB file here would close its connection mid-query — the
    // native close race — and crash the app).
    if (server.type === "local") {
      if (server.current) {
        // Active scope: reset in-memory (keeping `ready`) so a same-scope
        // re-login still fires the indexing gate; persist flushes the clear.
        useLocalLibrary.getState().clearLocalLibraryData();
        useRecentPlays.getState().clearRecentPlays();
      } else {
        const scoped = createScopedStorage(LOCAL_AUTH_SCOPE);
        scoped.removeItem("localLibraryStore");
        scoped.removeItem("recentPlays");
      }
    }
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
    <FadeOutScaleDown
      className="mb-4"
      onPress={handleCardPress}
      disabled={server.current}
      disabledOpacity={1}
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
          <HStack className="items-center mr-3">
            <ServerTypeIcon type={server.type} size={32} />
          </HStack>
          <VStack className="flex-1 items-start">
            <Heading size="md" className="text-white flex-1" numberOfLines={1}>
              {server.name}
            </Heading>
            <Text className="text-primary-100 text-sm mb-3" numberOfLines={1}>
              {server.url}
            </Text>
            {users.length > 0 ? (
              <AvatarGroup className="gap-x-4">
                {overflowCount > 0 && (
                  <Avatar size="sm" className="bg-primary-400 w-8 h-8">
                    <AvatarFallbackText>{`+${overflowCount}`}</AvatarFallbackText>
                  </Avatar>
                )}
                {visibleUsers.map((u) => (
                  <FadeOutScaleDown
                    key={`${u.serverId}:${u.username}`}
                    onPress={() => handleAvatarPress(u.username)}
                  >
                    <Avatar size="sm" className="bg-primary-400 w-8 h-8">
                      <AvatarFallbackText>{u.username}</AvatarFallbackText>
                    </Avatar>
                  </FadeOutScaleDown>
                ))}
              </AvatarGroup>
            ) : null}
          </VStack>
          <FadeOutScaleDown onPress={handlePresentModalPress}>
            <EllipsisVertical color={gray300} />
          </FadeOutScaleDown>
        </HStack>
      </VStack>
      <CenteredBottomSheetModal
        ref={bottomSheetModalRef}
        enableHalfExpand={false}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
      >
        <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
          <Box className="p-6 w-full mb-12">
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
                    {t("app.servers.editServer")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              {server.type !== "local" && (
                <FadeOutScaleDown
                  onPress={() => {
                    bottomSheetModalRef.current?.dismiss();
                    setShowManageUsersDialog(true);
                  }}
                >
                  <HStack className="items-center">
                    <UsersIcon size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.servers.manageUsers")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
              <FadeOutScaleDown
                onPress={() => {
                  bottomSheetModalRef.current?.dismiss();
                  setShowAlertDialog(true);
                }}
              >
                <HStack className="items-center">
                  <Trash size={24} color={gray200} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.servers.deleteServer")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
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
            {server.current && (
              <Text className="text-red-400 mt-3" size="sm">
                {t("app.servers.deleteCurrentServerConfirmWarning")}
              </Text>
            )}
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
                    <FadeOutScaleDown
                      onPress={() => {
                        handleCloseManageUsersDialog();
                        router.navigate(`/profile/${u.username}`);
                      }}
                      className="flex-1"
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
                    </FadeOutScaleDown>
                    <FadeOutScaleDown
                      onPress={() => removeUser(u.serverId, u.username)}
                    >
                      <Trash size={20} color={gray200} />
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
        <KeyboardAvoidingView
          behavior="padding"
          style={{ width: "100%", alignItems: "center" }}
        >
          <AlertDialogContent className="bg-primary-800 border-primary-400">
            <AlertDialogHeader>
              <Heading className="text-white font-bold" size="md">
                {t("app.servers.editServer")}
              </Heading>
            </AlertDialogHeader>
            <AlertDialogBody className="mt-3 mb-4">
              {server.type === "local" ? (
                <form.Field name="paths">
                  {(field) => (
                    <LocalPathsField
                      value={field.state.value}
                      onChange={field.handleChange}
                    />
                  )}
                </form.Field>
              ) : (
                <>
                  <form.Field name="name">
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
                            placeholder={t("app.servers.namePlaceholder")}
                          />
                        </Input>
                        <FieldError field={field} />
                      </FormControl>
                    )}
                  </form.Field>
                  <form.Field name="url">
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
                          <UrlInputField
                            value={field.state.value}
                            onChangeText={field.handleChange}
                            onBlur={() => handleFieldBlur(field)}
                            placeholder={t("app.servers.urlPlaceholder")}
                          />
                        </Input>
                        <FieldError field={field} />
                      </FormControl>
                    )}
                  </form.Field>
                  {/* Matches the login and add-server forms: advanced fields
                      behind a disclosure, client certificate gated on Android +
                      the native trust module (it does nothing elsewhere). */}
                  <AdvancedSettingsSection>
                    <form.Field name="fallbackUrl">
                      {(field) => (
                        <FallbackUrlField
                          field={field}
                          placeholder={t("app.servers.fallbackUrlPlaceholder")}
                        />
                      )}
                    </form.Field>
                    {Platform.OS === "android" && isSslTrustAvailable() && (
                      <form.Field name="mtlsAlias">
                        {(field) => (
                          <form.Subscribe
                            selector={(state) => state.values.url}
                          >
                            {(url) => (
                              <ClientCertificateField
                                value={field.state.value || undefined}
                                host={hostnameFromUrl(url ?? "")}
                                onChange={(alias) =>
                                  field.handleChange(alias ?? "")
                                }
                              />
                            )}
                          </form.Subscribe>
                        )}
                      </form.Field>
                    )}
                  </AdvancedSettingsSection>
                </>
              )}
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
                  isDirty ? form.handleSubmit() : undefined;
                }}
                className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
              >
                <Text className="text-primary-800 font-bold text-lg">
                  {t("app.shared.save")}
                </Text>
              </FadeOutScaleDown>
            </AlertDialogFooter>
          </AlertDialogContent>
        </KeyboardAvoidingView>
      </AlertDialog>
    </FadeOutScaleDown>
  );
}
