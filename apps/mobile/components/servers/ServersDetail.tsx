import { FlashList } from "@shopify/flash-list";
import { useForm, useStore } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import Plus from "lucide-react-native/dist/esm/icons/plus.mjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyDisplay from "@/components/EmptyDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import LocalPathsField from "@/components/forms/LocalPathsField";
import UrlInputField from "@/components/forms/UrlInputField";
import ServerTypeIcon from "@/components/ServerTypeIcon";
import ServerListItem from "@/components/servers/ServerListItem";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
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
import { useUsers } from "@/hooks/backend/useUsers";
import { useUsers as useNavidromeUsers } from "@/hooks/navidrome/useUsers";
import { useFloatingPlayerInset } from "@/hooks/useFloatingPlayerInset";
import useApp from "@/stores/app";
import useAuth from "@/stores/auth";
import useServers, {
  addServerFormSchema,
  type ServerType,
} from "@/stores/servers";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

export default function ServersDetail() {
  const { t } = useTranslation();
  const [showAddServerModal, setShowAddServerModal] = useState<boolean>(false);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const floatingPlayerInset = useFloatingPlayerInset();
  const isLandscape = useApp((s) => s.isLandscape);
  const servers = useServers((store) => store.servers);
  const addServer = useServers((store) => store.addServer);
  const syncServerUsers = useServers((store) => store.syncServerUsers);
  const isAuthenticated = useAuth((store) => store.isAuthenticated);
  const hasNavidromeNative = useAuth((store) => store.hasNavidromeNative);
  const isAdmin = useAuth((store) => store.isAdmin);
  const currentServer = servers.find((s) => s.current);
  const { data: subsonicUsers } = useUsers({
    enabled: !hasNavidromeNative && isAuthenticated && !!currentServer,
  });
  const { data: navidromeUsers } = useNavidromeUsers({
    enabled:
      hasNavidromeNative && isAdmin && isAuthenticated && !!currentServer,
  });
  useEffect(() => {
    if (!currentServer) return;
    if (hasNavidromeNative) {
      if (!navidromeUsers) return;
      syncServerUsers(
        currentServer.id,
        navidromeUsers.map((u) => u.userName),
      );
    } else {
      if (!subsonicUsers?.users?.user) return;
      syncServerUsers(
        currentServer.id,
        subsonicUsers.users.user.map((u) => u.username),
      );
    }
  }, [
    currentServer,
    hasNavidromeNative,
    subsonicUsers,
    navidromeUsers,
    syncServerUsers,
  ]);
  const form = useForm({
    defaultValues: {
      name: "",
      url: "",
      type: "navidrome" as ServerType,
      paths: [] as string[],
    },
    validators: {
      onChange: addServerFormSchema,
    },
    onSubmit: async ({ value }) => {
      if (value.type === "local") {
        const paths = (value.paths ?? []).map((p) => p.trim()).filter(Boolean);
        if (paths.length === 0) {
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("auth.login.localNoPaths")}
                </ToastDescription>
              </Toast>
            ),
          });
          return;
        }
        // Single local server (no remote URL, no multiple accounts): fixed
        // sentinel URL and default name, matching the login flow.
        addServer({
          name: t("auth.login.localLibraryName"),
          url: "local",
          type: "local",
          paths,
        });
      } else {
        addServer({ name: value.name, url: value.url, type: value.type });
      }
      form.reset();
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.servers.createServerSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
      setShowAddServerModal(false);
    },
  });

  const isDirty = useStore(form.store, (state) => state.isDirty);

  // The local library is a singleton (fixed `local` URL + scope), so only offer
  // it when none exists yet; an existing one is managed from its list entry.
  const hasLocalServer = servers.some((s) => s.type === "local");
  const serverTypeOptions: { value: ServerType; label: string }[] = [
    { value: "navidrome", label: t("auth.login.serverTypeNavidrome") },
    { value: "opensubsonic", label: t("auth.login.serverTypeOpenSubsonic") },
    { value: "jellyfin", label: t("auth.login.serverTypeJellyfin") },
    ...(hasLocalServer
      ? []
      : [
          {
            value: "local" as ServerType,
            label: t("auth.login.serverTypeLocal"),
          },
        ]),
  ];
  const serverTypeRows: [
    (typeof serverTypeOptions)[number],
    (typeof serverTypeOptions)[number]?,
  ][] = [];
  for (let i = 0; i < serverTypeOptions.length; i += 2) {
    serverTypeRows.push([serverTypeOptions[i], serverTypeOptions[i + 1]]);
  }

  const handleAddServerPress = () => {
    setShowAddServerModal(true);
  };

  const handleCloseAddServerModal = () => {
    setShowAddServerModal(false);
  };

  return (
    <Box className="h-full">
      <Box className={cn("px-6 pb-6 flex-1", isLandscape ? "mb-6" : "mt-6")}>
        <HStack
          className="items-center mb-6 justify-between"
          style={{ paddingTop: insets.top }}
        >
          <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <Heading className="text-white text-center flex-1" size="lg">
            {t("app.servers.title")}
          </Heading>
          <FadeOutScaleDown onPress={handleAddServerPress}>
            <Plus size={24} color="white" />
          </FadeOutScaleDown>
        </HStack>
        <FlashList
          data={servers}
          renderItem={({ item }) => <ServerListItem server={item} />}
          showsVerticalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingBottom:
              insets.bottom + bottomTabBarHeight + floatingPlayerInset,
          }}
          ListEmptyComponent={() => <EmptyDisplay />}
        />
        <AlertDialog
          isOpen={showAddServerModal}
          onClose={handleCloseAddServerModal}
          size="md"
        >
          <AlertDialogBackdrop />
          <KeyboardAvoidingView behavior="padding">
            <AlertDialogContent className="bg-primary-800 border-primary-400">
              <AlertDialogHeader>
                <Heading className="text-white font-bold" size="md">
                  {t("app.servers.addServer")}
                </Heading>
              </AlertDialogHeader>
              <AlertDialogBody className="mt-3 mb-4">
                <form.Field name="type">
                  {(field) =>
                    hasLocalServer ? (
                      // Only the three remote types: keep the compact single-row
                      // layout (stacked icon over label) rather than a 2+1 grid.
                      <HStack className="my-2 gap-2">
                        {serverTypeOptions.map((opt) => {
                          const selected = field.state.value === opt.value;
                          return (
                            <FadeOutScaleDown
                              key={opt.value}
                              onPress={() => field.handleChange(opt.value)}
                              className={`flex-1 rounded-md border ${
                                selected
                                  ? "border-emerald-500 bg-emerald-500"
                                  : "border-primary-600 bg-primary-600"
                              }`}
                            >
                              <VStack className="items-center justify-center py-3 px-2 gap-y-2">
                                <ServerTypeIcon type={opt.value} size={28} />
                                <Text
                                  className={`text-xs text-center ${
                                    selected
                                      ? "text-primary-800 font-bold"
                                      : "text-white"
                                  }`}
                                >
                                  {opt.label}
                                </Text>
                              </VStack>
                            </FadeOutScaleDown>
                          );
                        })}
                      </HStack>
                    ) : (
                      <VStack className="mb-2 gap-y-4">
                        {serverTypeRows.map(([a, b]) => (
                          <HStack key={a.value} className="gap-x-4">
                            {[a, b].map((opt) => {
                              if (!opt) return null;
                              const selected = field.state.value === opt.value;
                              return (
                                <FadeOutScaleDown
                                  key={opt.value}
                                  onPress={() => field.handleChange(opt.value)}
                                  className="flex-1"
                                >
                                  <HStack
                                    className={`items-center rounded-md bg-primary-600 border-2 py-3 px-3 gap-x-3 ${
                                      selected
                                        ? "border-emerald-500"
                                        : "border-primary-600"
                                    }`}
                                  >
                                    <ServerTypeIcon
                                      type={opt.value}
                                      size={28}
                                    />
                                    <Text
                                      className="text-sm text-white font-bold flex-1"
                                      numberOfLines={2}
                                    >
                                      {opt.label}
                                    </Text>
                                  </HStack>
                                </FadeOutScaleDown>
                              );
                            })}
                          </HStack>
                        ))}
                      </VStack>
                    )
                  }
                </form.Field>
                <form.Subscribe selector={(state) => state.values.type}>
                  {(type) =>
                    type === "local" ? (
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
                      </>
                    )
                  }
                </form.Subscribe>
              </AlertDialogBody>
              <AlertDialogFooter className="items-center justify-center">
                <FadeOutScaleDown
                  onPress={() => {
                    form.reset();
                    handleCloseAddServerModal();
                  }}
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
      </Box>
    </Box>
  );
}
