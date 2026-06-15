import { SelectPortalContext } from "@gluestack-ui/core/lib/esm/select/creator/SelectContext";
import { useForm } from "@tanstack/react-form";
import axios from "axios";
import { formatISO } from "date-fns/formatISO";
import { useLocalSearchParams } from "expo-router";
import EyeIcon from "lucide-react-native/dist/esm/icons/eye.mjs";
import EyeOffIcon from "lucide-react-native/dist/esm/icons/eye-off.mjs";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import Logo from "@/assets/images/logo.svg";
import LocalLibraryInfoDialog from "@/components/auth/LocalLibraryInfoDialog";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import LocalPathsField from "@/components/forms/LocalPathsField";
import UrlInputField from "@/components/forms/UrlInputField";
import LoginBackground from "@/components/LoginBackground";
import ServerTypeIcon from "@/components/ServerTypeIcon";
import {
  Avatar,
  AvatarFallbackText,
  AvatarGroup,
} from "@/components/ui/avatar";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { FormControl } from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ChevronDownIcon } from "@/components/ui/icon";
import { Input, InputField, InputSlot } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import {
  Select,
  SelectBackdrop,
  SelectContent,
  SelectDragIndicator,
  SelectDragIndicatorWrapper,
  SelectIcon,
  SelectInput,
  SelectPortal,
  SelectScrollView,
  SelectTrigger,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { authenticateByName as jellyfinAuthenticate } from "@/services/jellyfin/auth";
import { nativeLogin } from "@/services/navidrome/auth";
import { openSubsonicErrorCodes } from "@/services/openSubsonic";
import useAuth, { loginSchema } from "@/stores/auth";
import useServers, {
  type Server,
  type ServerType,
  type ServerUser,
} from "@/stores/servers";

function ServerSelectRow({
  server,
  users,
}: {
  server: Server;
  users: ServerUser[];
}) {
  const { onValueChange, handleClose } = useContext(SelectPortalContext);
  return (
    <FadeOutScaleDown
      className="mb-4 w-full"
      onPress={() => {
        onValueChange?.(server.id);
        handleClose?.();
      }}
    >
      <VStack className="bg-primary-600 px-4 py-2 w-full rounded-md border border-primary-600">
        <HStack className="items-start justify-between">
          <HStack className="mr-3">
            <ServerTypeIcon type={server.type} size={28} />
          </HStack>
          <VStack className="flex-1">
            <Heading size="md" className="text-white" numberOfLines={1}>
              {server.name}
            </Heading>
            <Text className="text-primary-100 text-sm mb-2" numberOfLines={1}>
              {server.url}
            </Text>
            {users.length > 0 && (
              <AvatarGroup>
                {users.slice(0, 4).map((u) => (
                  <Avatar
                    key={`${u.serverId}:${u.username}`}
                    className="bg-primary-400 w-8 h-8"
                  >
                    <AvatarFallbackText>{u.username}</AvatarFallbackText>
                  </Avatar>
                ))}
              </AvatarGroup>
            )}
          </VStack>
        </HStack>
      </VStack>
    </FadeOutScaleDown>
  );
}

export default function LoginScreen() {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  const toast = useToast();
  const params = useLocalSearchParams<{
    serverId?: string;
    username?: string;
  }>();
  const servers = useServers((store) => store.servers);
  const allUsers = useServers((store) => store.users);
  const addServer = useServers((store) => store.addServer);
  const setCurrentServer = useServers((store) => store.setCurrentServer);
  const addOrUpdateUser = useServers((store) => store.addOrUpdateUser);
  const login = useAuth((store) => store.login);
  const insets = useSafeAreaInsets();
  // biome-ignore lint/suspicious/noExplicitAny: gluestack ref typing
  const usernameRef = useRef<any>(null);
  // biome-ignore lint/suspicious/noExplicitAny: gluestack ref typing
  const passwordRef = useRef<any>(null);

  const preselectedServer = useMemo(
    () =>
      params.serverId
        ? servers.find((s) => s.id === params.serverId)
        : servers.find((s) => s.current),
    [params.serverId, servers],
  );

  const [showPassword, setShowPassword] = useState(false);
  const [showLocalInfo, setShowLocalInfo] = useState(false);

  const form = useForm({
    defaultValues: {
      username: params.username ?? "",
      password: "",
      url: preselectedServer?.url ?? "https://",
      type: (preselectedServer?.type ?? "navidrome") as ServerType,
      paths: (preselectedServer?.paths ?? []) as string[],
    },
    validators: {
      onChange: loginSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        const trimmedUrl = value.url.trim();
        const trimmedUsername = value.username.trim();
        const trimmedPassword = value.password.trim();
        const serverType: ServerType = value.type;

        if (serverType === "local") {
          const paths = (value.paths ?? [])
            .map((p) => p.trim())
            .filter(Boolean);
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
          // Single local server (no remote URL, no multiple accounts): a fixed
          // sentinel URL/username so the per-(server,user) scope is stable.
          const existing = servers.find((s) => s.type === "local");
          const server = addServer({
            name: existing?.name ?? t("auth.login.localLibraryName"),
            url: "local",
            type: "local",
            paths,
          });
          setCurrentServer(server.id);
          login("local", "local", "", { serverType: "local" });
        } else if (serverType === "jellyfin") {
          const payload = await jellyfinAuthenticate(
            trimmedUrl,
            trimmedUsername,
            trimmedPassword,
          );
          const existing = servers.find((s) => s.url === trimmedUrl);
          const fallbackName = `${t("app.servers.defaultServer")} (${formatISO(new Date())})`;
          const server = addServer({
            name: existing?.name ?? fallbackName,
            url: trimmedUrl,
            type: "jellyfin",
          });
          addOrUpdateUser({
            serverId: server.id,
            username: trimmedUsername,
          });
          setCurrentServer(server.id);
          login(trimmedUrl, trimmedUsername, trimmedPassword, {
            serverType: "jellyfin",
            jellyfin: {
              accessToken: payload.AccessToken,
              userId: payload.User.Id,
              isAdmin: !!payload.User.Policy?.IsAdministrator,
            },
          });
        } else {
          const rsp = await axios
            .create({
              baseURL: trimmedUrl,
              headers: { "Content-Type": "application/json" },
            })
            .get("/rest/ping", {
              params: {
                u: trimmedUsername,
                p: trimmedPassword,
                v: process.env.EXPO_PUBLIC_OPENSUBSONIC_API_VERSION,
                c: process.env.EXPO_PUBLIC_CLIENT_NAME,
                f: "json",
              },
            });
          if (rsp.data["subsonic-response"]?.status !== "ok") {
            throw new Error(
              openSubsonicErrorCodes[rsp.data["subsonic-response"].error.code],
            );
          }

          const existing = servers.find((s) => s.url === trimmedUrl);
          const fallbackName = `${t("app.servers.defaultServer")} (${formatISO(new Date())})`;
          const server = addServer({
            name: existing?.name ?? fallbackName,
            url: trimmedUrl,
            type: serverType,
          });
          addOrUpdateUser({
            serverId: server.id,
            username: trimmedUsername,
          });
          setCurrentServer(server.id);

          let navidromeSession = null;
          if (serverType === "navidrome") {
            try {
              const payload = await nativeLogin(
                trimmedUrl,
                trimmedUsername,
                trimmedPassword,
              );
              if (payload?.token && payload?.id) {
                navidromeSession = {
                  token: payload.token,
                  userId: payload.id,
                  isAdmin: !!payload.isAdmin,
                };
              }
            } catch (err) {
              console.warn(
                "[auth] Navidrome native /auth/login unavailable, falling back to Subsonic-only mode",
                err,
              );
            }
          }

          login(trimmedUrl, trimmedUsername, trimmedPassword, {
            serverType,
            navidrome: navidromeSession,
          });
        }
        toast.show({
          placement: "top",
          duration: 3000,
          render: () => (
            <Toast action="success">
              <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
              <ToastDescription>
                {t("auth.login.loginSuccessMessage")}
              </ToastDescription>
            </Toast>
          ),
        });
      } catch (error) {
        toast.show({
          placement: "top",
          duration: 3000,
          render: () => (
            <Toast action="error">
              <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
              <ToastDescription>
                {axios.isAxiosError(error)
                  ? t("auth.login.loginErrorMessage")
                  : (error as Error).message}
              </ToastDescription>
            </Toast>
          ),
        });
      }
    },
  });

  useEffect(() => {
    if (params.username) {
      passwordRef.current?.focus();
    } else if (params.serverId) {
      usernameRef.current?.focus();
    }
  }, [params.serverId, params.username]);

  const handleServerChange = (serverId: string) => {
    const server = servers.find((s) => s.id === serverId);
    if (!server) return;
    setCurrentServer(server.id);
    form.setFieldValue("url", server.url);
    form.setFieldValue("username", "");
    form.setFieldValue("password", "");
    form.setFieldValue("type", server.type);
    form.setFieldValue("paths", server.paths ?? []);
    if (server.type !== "local") {
      setTimeout(() => usernameRef.current?.focus(), 250);
    }
  };

  const handleDemoModePress = () => {
    form.setFieldValue("url", "https://demo.navidrome.org");
    form.setFieldValue("username", "demo");
    form.setFieldValue("password", "demo");
    form.setFieldValue("type", "navidrome");
  };

  const handleNavidromeSetupHelpPress = () => {
    Linking.openURL("https://www.navidrome.org/docs/installation/");
  };

  const handleJellyfinSetupHelpPress = () => {
    Linking.openURL("https://jellyfin.org/docs/general/quick-start");
  };

  const serverTypeOptions: { value: ServerType; label: string }[] = [
    { value: "navidrome", label: t("auth.login.serverTypeNavidrome") },
    { value: "opensubsonic", label: t("auth.login.serverTypeOpenSubsonic") },
    { value: "jellyfin", label: t("auth.login.serverTypeJellyfin") },
    { value: "local", label: t("auth.login.serverTypeLocal") },
  ];
  const serverTypeRows: [
    (typeof serverTypeOptions)[number],
    (typeof serverTypeOptions)[number]?,
  ][] = [];
  for (let i = 0; i < serverTypeOptions.length; i += 2) {
    serverTypeRows.push([serverTypeOptions[i], serverTypeOptions[i + 1]]);
  }

  const triggerLabel =
    preselectedServer?.name ?? t("auth.login.serverPlaceholder");

  return (
    <Box className="flex-1 bg-primary-800">
      <LoginBackground />
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Box className="px-6">
          <Center className="mb-4 ">
            <Logo width={64} height={64} />
          </Center>
          <Heading size="2xl" className="text-white font-bold mb-6">
            {t("auth.login.title")}
          </Heading>
          {servers && servers.length > 0 && (
            <Box>
              <Select onValueChange={handleServerChange}>
                <SelectTrigger className="bg-primary-600 border border-primary-600 rounded-md px-6 py-3 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500">
                  <SelectInput
                    placeholder={t("auth.login.serverPlaceholder")}
                    value={triggerLabel}
                    className="text-md text-white"
                    placeholderTextColor={white}
                  />
                  <SelectIcon as={ChevronDownIcon} />
                </SelectTrigger>
                <SelectPortal snapPoints={[50]}>
                  <SelectBackdrop />
                  <SelectContent className="bg-primary-600">
                    <SelectDragIndicatorWrapper className="mb-6">
                      <SelectDragIndicator />
                    </SelectDragIndicatorWrapper>
                    <SelectScrollView>
                      <Box className="p-6 w-full mb-12 divide-y divide-y-white">
                        {servers.map((server) => (
                          <ServerSelectRow
                            key={server.id}
                            server={server}
                            users={allUsers.filter(
                              (u) => u.serverId === server.id,
                            )}
                          />
                        ))}
                      </Box>
                    </SelectScrollView>
                  </SelectContent>
                </SelectPortal>
              </Select>
              <Text className="text-primary-100 text-center my-4">
                {t("auth.login.choice")}
              </Text>
            </Box>
          )}
          <form.Field name="type">
            {(field) => (
              <VStack className="mb-4 gap-y-4">
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
                  <form.Field name="url">
                    {(field) => (
                      <FormControl
                        isInvalid={showFieldError(field)}
                        isDisabled={false}
                        isReadOnly={false}
                        isRequired={false}
                        className="mb-2 mt-0"
                      >
                        <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                          <UrlInputField
                            value={field.state.value}
                            onChangeText={field.handleChange}
                            onBlur={() => handleFieldBlur(field)}
                            placeholder={t("auth.login.urlPlaceholder")}
                          />
                        </Input>
                        <FieldError field={field} />
                      </FormControl>
                    )}
                  </form.Field>
                  <form.Field name="username">
                    {(field) => (
                      <FormControl
                        isInvalid={showFieldError(field)}
                        size="md"
                        isDisabled={false}
                        isReadOnly={false}
                        isRequired={false}
                        className="my-2"
                      >
                        <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                          <InputField
                            ref={usernameRef}
                            value={field.state.value}
                            onChangeText={field.handleChange}
                            onBlur={() => handleFieldBlur(field)}
                            className="text-md text-white"
                            placeholder={t("auth.login.usernamePlaceholder")}
                            autoCapitalize="none"
                            textContentType="username"
                            returnKeyType="next"
                            onSubmitEditing={() => passwordRef.current?.focus()}
                          />
                        </Input>
                        <FieldError field={field} />
                      </FormControl>
                    )}
                  </form.Field>
                  <form.Field name="password">
                    {(field) => (
                      <FormControl
                        isInvalid={showFieldError(field)}
                        size="md"
                        isDisabled={false}
                        isReadOnly={false}
                        isRequired={false}
                        className="my-2"
                      >
                        <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                          <InputField
                            ref={passwordRef}
                            value={field.state.value}
                            onChangeText={field.handleChange}
                            onBlur={() => handleFieldBlur(field)}
                            className="text-md text-white"
                            placeholder={t("auth.login.passwordPlaceholder")}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            textContentType="password"
                            returnKeyType="go"
                            onSubmitEditing={() => form.handleSubmit()}
                          />
                          <InputSlot>
                            <Pressable
                              onPress={() => setShowPassword((v) => !v)}
                              accessibilityRole="button"
                              accessibilityLabel={
                                showPassword
                                  ? t("auth.login.hidePassword")
                                  : t("auth.login.showPassword")
                              }
                            >
                              {showPassword ? (
                                <EyeOffIcon size={20} color={white} />
                              ) : (
                                <EyeIcon size={20} color={white} />
                              )}
                            </Pressable>
                          </InputSlot>
                        </Input>
                        <FieldError field={field} />
                      </FormControl>
                    )}
                  </form.Field>
                </>
              )
            }
          </form.Subscribe>
          <FadeOutScaleDown
            onPress={() => {
              // Local logins have no credentials to edit and the saved folders
              // pre-fill `paths`, so the form is never dirty on re-login; gate
              // them on type instead. Remote servers keep the dirty guard.
              const { isDirty, values } = form.state;
              if (isDirty || values.type === "local") form.handleSubmit();
            }}
            className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4 mt-4"
          >
            <Text className="text-primary-800 font-bold text-lg">
              {t("auth.login.login")}
            </Text>
          </FadeOutScaleDown>
          <form.Subscribe selector={(state) => state.values.type}>
            {(type) => {
              if (type === "navidrome")
                return (
                  <>
                    <FadeOutScaleDown
                      onPress={handleDemoModePress}
                      className="mt-12"
                    >
                      <Text className="text-primary-100 text-center text-sm">
                        {t("auth.login.demo")}
                      </Text>
                    </FadeOutScaleDown>
                    <FadeOutScaleDown
                      onPress={handleNavidromeSetupHelpPress}
                      className="mt-4"
                    >
                      <Text className="text-primary-100 text-center text-sm">
                        {t("auth.login.navidromeSetupHelp")}
                      </Text>
                    </FadeOutScaleDown>
                  </>
                );
              if (type === "jellyfin")
                return (
                  <FadeOutScaleDown
                    onPress={handleJellyfinSetupHelpPress}
                    className="mt-12"
                  >
                    <Text className="text-primary-100 text-center text-sm">
                      {t("auth.login.jellyfinSetupHelp")}
                    </Text>
                  </FadeOutScaleDown>
                );
              if (type === "local")
                return (
                  <FadeOutScaleDown
                    onPress={() => setShowLocalInfo(true)}
                    className="mt-12"
                  >
                    <Text className="text-primary-100 text-center text-sm">
                      {t("auth.login.localSetupHelp")}
                    </Text>
                  </FadeOutScaleDown>
                );
              return null;
            }}
          </form.Subscribe>
        </Box>
      </KeyboardAwareScrollView>
      <LocalLibraryInfoDialog
        isOpen={showLocalInfo}
        onClose={() => setShowLocalInfo(false)}
      />
    </Box>
  );
}
