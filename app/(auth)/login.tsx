import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import {
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
} from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { Input, InputField } from "@/components/ui/input";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import useAuth, { loginSchema } from "@/stores/auth";
import useServers from "@/stores/servers";
import { useForm } from "@tanstack/react-form";
import { AlertCircleIcon } from "lucide-react-native";

export default function LoginScreen() {
  const toast = useToast();
  const servers = useServers.use.servers();
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
      login(value.url, value.username, value.password);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastDescription>Server successfully added</ToastDescription>
          </Toast>
        ),
      });
    },
  });
  return (
    <SafeAreaView>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Box className="px-6 mt-6 mb-4">
          <Heading size="2xl" className="text-white font-bold">
            Login
          </Heading>
          <form.Field name="url">
            {(field) => (
              <FormControl
                isInvalid={!field.state.meta.isValid}
                size="md"
                isDisabled={false}
                isReadOnly={false}
                isRequired={false}
              >
                <Input className="border-white my-6 h-16" variant="underlined">
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
                <Input className="border-white my-6 h-16" variant="underlined">
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
                <Input className="border-white my-6 h-16" variant="underlined">
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
            className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
          >
            <Text className="text-primary-800 font-bold text-lg">Login</Text>
          </FadeOutScaleDown>
        </Box>
      </ScrollView>
    </SafeAreaView>
  );
}
