import Logo from "@/assets/images/logo.svg";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
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
import { Input, InputField } from "@/components/ui/input";
import { SafeAreaView } from "@/components/ui/safe-area-view";
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
import useServers, { type Server } from "@/stores/servers";
import { cn } from "@/utils/tailwind";
import { useForm } from "@tanstack/react-form";
import axios from "axios";
import { formatISO } from "date-fns";
import { AlertCircleIcon, ChevronDownIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function LoginScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const servers = useServers((store) => store.servers);
  const addServer = useServers((store) => store.addServer);
  const setCurrentServer = useServers((store) => store.setCurrentServer);
  const login = useAuth((store) => store.login);
  const insets = useSafeAreaInsets();
  const form = useForm({
    defaultValues: {
      username: "",
      password: "",
      url: "",
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

        const newServerName = `${t("app.servers.defaultServer")} (${formatISO(new Date())})`;
        addServer({
          ...value,
          name: newServerName,
          current: true,
        });
        setCurrentServer(newServerName);
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
                  : error.message}
              </ToastDescription>
            </Toast>
          ),
        });
      }
    },
  });

  const handleServerPress = async (server: Server) => {
    try {
      setCurrentServer(server.name);
      const rsp = await axios
        .create({
          baseURL: server.url,
          headers: { "Content-Type": "application/json" },
        })
        .get("/rest/ping", {
          params: {
            u: server.username,
            p: server.password,
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
      login(server.url, server.username, server.password);
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
                : error.message}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

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
              <Select>
                <SelectTrigger
                  variant="outline"
                  size="xl"
                  className="justify-between bg-primary-600 border-0 rounded-full"
                >
                  <SelectInput
                    placeholder={t("auth.login.serverPlaceholder")}
                    className="text-md"
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
                          // <SelectItem
                          //   key={server.name}
                          //   label={server.name}
                          //   value={server.name}
                          // />
                          <FadeOutScaleDown
                            key={server.name}
                            className="mb-4 w-full"
                            onPress={() => handleServerPress(server)}
                          >
                            <VStack className="bg-primary-600 p-4 w-full rounded-md border border-primary-600">
                              <HStack className="items-center justify-between">
                                <VStack>
                                  <Heading
                                    size="md"
                                    className="text-white mb-4"
                                    numberOfLines={1}
                                  >
                                    {server.name}
                                  </Heading>
                                  <HStack>
                                    <Text
                                      className="text-primary-100 text-sm"
                                      numberOfLines={1}
                                    >
                                      {server.url}
                                    </Text>
                                    <Text className="text-primary-100 text-sm">
                                      {" "}
                                      ⦁{" "}
                                    </Text>
                                    <Text className="text-primary-100 text-sm">
                                      {server.username}
                                    </Text>
                                  </HStack>
                                </VStack>
                              </HStack>
                            </VStack>
                          </FadeOutScaleDown>
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
                        .map((error) => error.message)
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
                        .map((error) => error.message)
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
                        .map((error) => error.message)
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
