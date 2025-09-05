import FadeOutScaleDown from "@/components/FadeOutScaleDown";
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
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import {
  Select,
  SelectBackdrop,
  SelectContent,
  SelectDragIndicator,
  SelectDragIndicatorWrapper,
  SelectIcon,
  SelectInput,
  SelectItem,
  SelectPortal,
  SelectScrollView,
  SelectTrigger,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import useAuth, { loginSchema } from "@/stores/auth";
import useServers, { type Server } from "@/stores/servers";
import { cn } from "@/utils/tailwind";
import { useForm } from "@tanstack/react-form";
import { AlertCircleIcon, ChevronDownIcon } from "lucide-react-native";

export default function LoginScreen() {
  const toast = useToast();
  const servers = useServers.use.servers();
  const addServer = useServers.use.addServer();
  const setCurrentServer = useServers.use.setCurrentServer();
  const login = useAuth.use.login();
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
      addServer({
        ...value,
        name: "Default",
        current: true,
      });
      login(value.url, value.username, value.password);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastDescription>Successfully signed in</ToastDescription>
          </Toast>
        ),
      });
    },
  });

  const handleServerPress = (server: Server) => {
    setCurrentServer(server.name);
    login(server.url, server.username, server.password);
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastDescription>Successfully signed in</ToastDescription>
        </Toast>
      ),
    });
  };

  return (
    <SafeAreaView>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          justifyContent: "center",
          height: "100%",
        }}
      >
        <Box className="px-6">
          <Heading size="2xl" className="text-white font-bold">
            Sign in
          </Heading>
          {servers && servers.length > 0 && (
            <Box className="mt-6">
              <Select>
                <SelectTrigger
                  variant="outline"
                  size="xl"
                  className="justify-between"
                >
                  <SelectInput placeholder="Select server" />
                  <SelectIcon className="mr-3" as={ChevronDownIcon} />
                </SelectTrigger>
                <SelectPortal snapPoints={[50]}>
                  <SelectBackdrop />
                  <SelectContent className="bg-primary-600">
                    <SelectDragIndicatorWrapper className="mb-6">
                      <SelectDragIndicator />
                    </SelectDragIndicatorWrapper>
                    <SelectScrollView>
                      <Box className="p-6 w-full mb-12 divide-y divide-primary-600">
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
              <Text className="text-primary-100 text-center mt-4">
                Or enter your server details
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
                className="my-4"
              >
                <Input className="border-white" variant="underlined">
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
                className="my-4"
              >
                <Input className="border-white" variant="underlined">
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
                className="my-4"
              >
                <Input className="border-white" variant="underlined">
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
          <FadeOutScaleDown
            onPress={() => {
              form.state.isDirty ? form.handleSubmit() : undefined;
            }}
            className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4 mt-4"
          >
            <Text className="text-primary-800 font-bold text-lg">Login</Text>
          </FadeOutScaleDown>
        </Box>
      </ScrollView>
    </SafeAreaView>
  );
}
