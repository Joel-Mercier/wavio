import { SelectPortalContext } from "@gluestack-ui/core/lib/esm/select/creator/SelectContext";
import { useForm } from "@tanstack/react-form";
import axios from "axios";
import { formatISO } from "date-fns";
import { useLocalSearchParams } from "expo-router";
import { EyeIcon, EyeOffIcon } from "lucide-react-native";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import Logo from "@/assets/images/logo.svg";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
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
import { openSubsonicErrorCodes } from "@/services/openSubsonic";
import useAuth, { loginSchema } from "@/stores/auth";
import useServers, { type Server, type ServerUser } from "@/stores/servers";

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
      <VStack className="bg-primary-600 p-4 w-full rounded-md border border-primary-600">
        <HStack className="items-center justify-between">
          <VStack className="flex-1">
            <Heading size="md" className="text-white mb-2" numberOfLines={1}>
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

  const form = useForm({
    defaultValues: {
      username: params.username ?? "",
      password: "",
      url: preselectedServer?.url ?? "https://",
    },
    validators: {
      onChange: loginSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        const rsp = await axios
          .create({
            baseURL: value.url.trim(),
            headers: { "Content-Type": "application/json" },
          })
          .get("/rest/ping", {
            params: {
              u: value.username.trim(),
              p: value.password.trim(),
              v: process.env.EXPO_PUBLIC_NAVIDROME_SUBSONIC_API_VERSION,
              c: process.env.EXPO_PUBLIC_NAVIDROME_CLIENT,
              f: "json",
            },
          });
        if (rsp.data["subsonic-response"]?.status !== "ok") {
          throw new Error(
            openSubsonicErrorCodes[rsp.data["subsonic-response"].error.code],
          );
        }

        const trimmedUrl = value.url.trim();
        const existing = servers.find((s) => s.url === trimmedUrl);
        const fallbackName = `${t("app.servers.defaultServer")} (${formatISO(new Date())})`;
        const server = addServer({
          name: existing?.name ?? fallbackName,
          url: trimmedUrl,
        });
        addOrUpdateUser({
          serverId: server.id,
          username: value.username.trim(),
        });
        setCurrentServer(server.id);
        login(value.url, value.username, value.password);
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
    setTimeout(() => usernameRef.current?.focus(), 250);
  };

  const handleDemoModePress = () => {
    form.setFieldValue("url", "https://demo.navidrome.org");
    form.setFieldValue("username", "demo");
    form.setFieldValue("password", "demo");
  };

  const triggerLabel =
    preselectedServer?.name ?? t("auth.login.serverPlaceholder");

  return (
    <Box
      className="justify-center h-full"
      style={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <KeyboardAvoidingView behavior={"padding"}>
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
          <form.Field name="url">
            {(field) => {
              const protocol = field.state.value.startsWith("http://")
                ? "http://"
                : "https://";
              const host = field.state.value.replace(/^https?:\/\//, "");
              const toggleProtocol = () => {
                const next = protocol === "https://" ? "http://" : "https://";
                field.handleChange(`${next}${host}`);
              };
              const handleHostChange = (text: string) => {
                field.handleChange(
                  `${protocol}${text.replace(/^https?:\/\//, "")}`,
                );
              };
              return (
                <FormControl
                  isInvalid={showFieldError(field)}
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="mb-2 mt-0"
                >
                  <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                    <InputSlot>
                      <Pressable
                        onPress={toggleProtocol}
                        className="pr-2 justify-center"
                      >
                        <Text className="text-white text-md">{protocol}</Text>
                      </Pressable>
                    </InputSlot>
                    <InputField
                      value={host}
                      onChangeText={handleHostChange}
                      onBlur={() => handleFieldBlur(field)}
                      className="text-md text-white"
                      placeholder={t("auth.login.urlPlaceholder")}
                      textContentType="URL"
                      autoCapitalize="none"
                      keyboardType="url"
                    />
                  </Input>
                  <FieldError field={field} />
                </FormControl>
              );
            }}
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
          <FadeOutScaleDown
            onPress={() => {
              form.state.isDirty ? form.handleSubmit() : undefined;
            }}
            className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4 mt-4"
          >
            <Text className="text-primary-800 font-bold text-lg">
              {t("auth.login.login")}
            </Text>
          </FadeOutScaleDown>
          <FadeOutScaleDown onPress={handleDemoModePress} className="mt-12">
            <Text className="text-primary-100 text-center text-sm">
              {t("auth.login.demo")}
            </Text>
          </FadeOutScaleDown>
        </Box>
      </KeyboardAvoidingView>
    </Box>
  );
}
