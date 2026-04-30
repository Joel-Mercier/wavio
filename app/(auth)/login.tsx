import { SelectPortalContext } from "@gluestack-ui/core/lib/esm/select/creator/SelectContext";
import { useForm } from "@tanstack/react-form";
import axios from "axios";
import { formatISO } from "date-fns";
import { useLocalSearchParams } from "expo-router";
import { AlertCircleIcon } from "lucide-react-native";
import { useContext, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Logo from "@/assets/images/logo.svg";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import {
  Avatar,
  AvatarFallbackText,
  AvatarGroup,
} from "@/components/ui/avatar";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import {
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
} from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ChevronDownIcon } from "@/components/ui/icon";
import { Input, InputField } from "@/components/ui/input";
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
import { themeConfig } from "@/config/theme";
import { openSubsonicErrorCodes } from "@/services/openSubsonic";
import useAuth, { loginSchema } from "@/stores/auth";
import useServers, { type Server, type ServerUser } from "@/stores/servers";
import { cn } from "@/utils/tailwind";

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
            <Heading
              size="md"
              className="text-white mb-2"
              numberOfLines={1}
            >
              {server.name}
            </Heading>
            <Text
              className="text-primary-100 text-sm mb-2"
              numberOfLines={1}
            >
              {server.url}
            </Text>
            {users.length > 0 && (
              <AvatarGroup>
                {users.slice(0, 4).map((u) => (
                  <Avatar
                    key={`${u.serverId}:${u.username}`}
                    size="sm"
                    className="bg-primary-400"
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

  const form = useForm({
    defaultValues: {
      username: params.username ?? "",
      password: "",
      url: preselectedServer?.url ?? "",
    },
    validators: {
      onBlur: loginSchema,
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
          password: value.password.trim(),
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
                <SelectTrigger
                  variant="outline"
                  size="xl"
                  className="justify-between bg-primary-600 border-0 rounded-full px-6"
                >
                  <SelectInput
                    placeholder={t("auth.login.serverPlaceholder")}
                    value={triggerLabel}
                    className="text-md placeholder:text-white"
                    placeholderTextColor={themeConfig.theme.colors.white}
                  />
                  <SelectIcon className="mr-3" as={ChevronDownIcon} />
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
            {(field) => (
              <FormControl
                isInvalid={!field.state.meta.isValid}
                size="md"
                isDisabled={false}
                isReadOnly={false}
                isRequired={false}
                className="mb-2 mt-0"
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
                    placeholder={t("auth.login.urlPlaceholder")}
                    textContentType="URL"
                    autoCapitalize="none"
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
                        .join("\n")}
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
                className="my-2"
              >
                <Input
                  className="bg-primary-600 border-0 rounded-full"
                  variant="rounded"
                  size="xl"
                >
                  <InputField
                    ref={usernameRef}
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={field.handleBlur}
                    className={cn(
                      "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-full",
                      {
                        "border-red-500": !field.state.meta.isValid,
                      },
                    )}
                    placeholder={t("auth.login.usernamePlaceholder")}
                    autoCapitalize="none"
                    textContentType="username"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
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
                        .join("\n")}
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
                className="my-2"
              >
                <Input
                  className="bg-primary-600 border-0 rounded-full"
                  variant="rounded"
                  size="xl"
                >
                  <InputField
                    ref={passwordRef}
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={field.handleBlur}
                    className={cn(
                      "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-full",
                      {
                        "border-red-500": !field.state.meta.isValid,
                      },
                    )}
                    placeholder={t("auth.login.passwordPlaceholder")}
                    secureTextEntry
                    autoCapitalize="none"
                    textContentType="password"
                    returnKeyType="go"
                    onSubmitEditing={() => form.handleSubmit()}
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
                        .join("\n")}
                    </FormControlErrorText>
                  </FormControlError>
                )}
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
        </Box>
      </KeyboardAvoidingView>
    </Box>
  );
}
