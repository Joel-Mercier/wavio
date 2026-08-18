import { FlashList } from "@shopify/flash-list";
import { useForm, useSelector } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import Plus from "lucide-react-native/dist/esm/icons/plus.mjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyDisplay from "@/components/EmptyDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import AdvancedSettingsSection from "@/components/forms/AdvancedSettingsSection";
import ClientCertificateField from "@/components/forms/ClientCertificateField";
import CustomHeadersField from "@/components/forms/CustomHeadersField";
import FallbackUrlField from "@/components/forms/FallbackUrlField";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import LibraryPathField from "@/components/forms/LibraryPathField";
import LocalPathsField from "@/components/forms/LocalPathsField";
import UrlInputField, {
  protocolsForServerType,
  realignUrlProtocol,
} from "@/components/forms/UrlInputField";
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
import { useIsDeviceOnline } from "@/hooks/useIsOnline";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { isSmbAvailable } from "@/modules/smb";
import { hostnameFromUrl, isSslTrustAvailable } from "@/modules/ssl-trust";
import {
  isNetworkShareType,
  isSingletonServerType,
} from "@/services/backend/serverTraits";
import { parseSmbUrl } from "@/services/fileSource/smbAddress";
import { syncSslClientCertificates, syncSslProxy } from "@/services/sslTrust";
import useApp from "@/stores/app";
import useAuth from "@/stores/auth";
import useServers, {
  addServerFormSchema,
  cleanOptionalUrl,
  type HeaderRow,
  headerRowsToRecord,
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
  const screenBottomPadding = useScreenBottomPadding();
  const isWideLayout = useApp((s) => s.isWideLayout);
  // Adding a remote server requires authenticating against it — pointless with
  // no connectivity at all (device-online, not current-server reachability, so
  // an unreachable *current* server doesn't block adding a reachable one).
  const isDeviceOnline = useIsDeviceOnline();
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
      libraryPath: "",
      mtlsAlias: "",
      fallbackUrl: "",
      headers: [] as HeaderRow[],
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
        // `z.url()` accepts `smb://host` with no share name, which is the mistake
        // people actually make. Caught here rather than in the schema because the
        // stores can't reach i18n (see stores/servers.ts) and this needs to say
        // what the address should look like.
        if (value.type === "smb" && !parseSmbUrl(value.url)) {
          toast.show({
            placement: "top",
            duration: 5000,
            render: () => (
              <Toast action="error">
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("auth.login.smbUrlInvalid")}
                </ToastDescription>
              </Toast>
            ),
          });
          return;
        }
        addServer({
          name: value.name,
          url: value.url,
          type: value.type,
          libraryPath: isNetworkShareType(value.type)
            ? value.libraryPath?.trim() || undefined
            : undefined,
          mtlsAlias: value.mtlsAlias?.trim() || undefined,
          fallbackUrl: cleanOptionalUrl(value.fallbackUrl),
          headers: headerRowsToRecord(value.headers),
        });
        // Refresh the native KeyManager so this server's client cert is
        // presented on future connections, and register the (possibly new)
        // fallback origin with the iOS loopback proxy.
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
              {t("app.servers.createServerSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
      setShowAddServerModal(false);
    },
  });

  const isDirty = useSelector(form.store, (state) => state.isDirty);

  // Re-scheme the URL alongside the type: the field renders the scheme separately
  // from the value it stores, so an `https://` left over from another type would
  // fail validation with nothing on screen to explain it.
  const selectServerType = (next: ServerType) => {
    form.setFieldValue("type", next);
    form.setFieldValue("url", (current) =>
      realignUrlProtocol(current, protocolsForServerType(next)),
    );
  };

  // The local library is a singleton (fixed `local` URL + scope), so only offer
  // it when none exists yet; an existing one is managed from its list entry.
  const hasLocalServer = servers.some((s) => isSingletonServerType(s.type));
  const serverTypeOptions: { value: ServerType; label: string }[] = [
    { value: "navidrome", label: t("auth.login.serverTypeNavidrome") },
    { value: "opensubsonic", label: t("auth.login.serverTypeOpenSubsonic") },
    { value: "jellyfin", label: t("auth.login.serverTypeJellyfin") },
    { value: "webdav", label: t("auth.login.serverTypeWebdav") },
    // Only where the SMB native module loaded — see login.tsx.
    ...(isSmbAvailable()
      ? [{ value: "smb" as ServerType, label: t("auth.login.serverTypeSmb") }]
      : []),
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
      <Box className={cn("px-6 pb-6 flex-1", isWideLayout ? "mb-6" : "mt-6")}>
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
          <FadeOutScaleDown
            onPress={handleAddServerPress}
            disabled={!isDeviceOnline && hasLocalServer}
          >
            <Plus size={24} color="white" />
          </FadeOutScaleDown>
        </HStack>
        <FlashList
          data={servers}
          renderItem={({ item }) => <ServerListItem server={item} />}
          showsVerticalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingBottom: screenBottomPadding,
          }}
          ListEmptyComponent={() => <EmptyDisplay />}
        />
        <AlertDialog
          isOpen={showAddServerModal}
          onClose={handleCloseAddServerModal}
          size="md"
        >
          <AlertDialogBackdrop />
          <AlertDialogContent className="bg-primary-800 border-primary-400">
            <AlertDialogHeader>
              <Heading className="text-white font-bold" size="md">
                {t("app.servers.addServer")}
              </Heading>
            </AlertDialogHeader>
            <AlertDialogBody className="mt-3 mb-4">
              {/* Two per row, always: with five or six types (three remote,
                  WebDAV, SMB, and the local library when it doesn't exist yet) a
                  single row leaves no room for a readable label. */}
              <form.Field name="type">
                {(field) => (
                  <VStack className="mb-2 gap-y-4">
                    {serverTypeRows.map(([a, b]) => (
                      <HStack key={a.value} className="gap-x-4">
                        {[a, b].map((opt) => {
                          if (!opt) return null;
                          const selected = field.state.value === opt.value;
                          return (
                            <FadeOutScaleDown
                              key={opt.value}
                              onPress={() => selectServerType(opt.value)}
                              className="flex-1"
                            >
                              <HStack
                                className={`items-center rounded-md bg-primary-600 border-2 py-3 px-3 gap-x-3 ${
                                  selected
                                    ? "border-emerald-500"
                                    : "border-primary-600"
                                }`}
                              >
                                <ServerTypeIcon type={opt.value} size={28} />
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
                )}
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
                                protocols={protocolsForServerType(type)}
                                placeholder={
                                  type === "smb"
                                    ? t("auth.login.smbUrlPlaceholder")
                                    : t("app.servers.urlPlaceholder")
                                }
                              />
                            </Input>
                            <FieldError field={field} />
                          </FormControl>
                        )}
                      </form.Field>
                      {isNetworkShareType(type) && (
                        <form.Field name="libraryPath">
                          {(field) => <LibraryPathField field={field} />}
                        </form.Field>
                      )}
                      {/* Cross-platform section; only the client certificate
                            is gated on Android + the native trust module. */}
                      <AdvancedSettingsSection>
                        <form.Field name="fallbackUrl">
                          {(field) => (
                            <FallbackUrlField
                              field={field}
                              placeholder={t(
                                "app.servers.fallbackUrlPlaceholder",
                              )}
                            />
                          )}
                        </form.Field>
                        <form.Field name="headers">
                          {(field) => (
                            <CustomHeadersField
                              value={field.state.value}
                              onChange={field.handleChange}
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
        </AlertDialog>
      </Box>
    </Box>
  );
}
