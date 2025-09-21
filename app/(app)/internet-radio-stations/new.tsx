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
import { Text } from "@/components/ui/text";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useCreateInternetRadioStation } from "@/hooks/openSubsonic/useInternetRadioStations";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { AlertCircleIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import z from "zod";

const newInternetRadioStationSchema = z.object({
  name: z.string().min(1),
  streamUrl: z.url(),
  homePageUrl: z.url().optional(),
});
export default function NewInternetRadioStationScreen() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const doCreateInternetRadioStation = useCreateInternetRadioStation();
  const form = useForm({
    defaultValues: {
      name: "",
      streamUrl: "",
      homePageUrl: "",
    },
    validators: {
      onChange: newInternetRadioStationSchema,
    },
    onSubmit: async ({ value }) => {
      doCreateInternetRadioStation.mutate(
        { ...value },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: ["internet_radio_stations"],
            });
            router.navigate("/(app)/(tabs)/(home)");
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="success">
                  <ToastDescription>
                    Internet radio station successfully created
                  </ToastDescription>
                </Toast>
              ),
            });
          },
          onError: (error) => {
            console.error(error);
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="error">
                  <ToastDescription>
                    An error occurred while creating the internet radio station
                  </ToastDescription>
                </Toast>
              ),
            });
          },
        },
      );
    },
  });

  const handleCancelPress = () => {
    router.back();
  };

  return (
    <LinearGradient
      colors={[themeConfig.theme.colors.gray[300], "transparent"]}
      className="h-full"
    >
      <Box
        className="h-full justify-center"
        style={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <VStack className="w-full px-6">
          <Center>
            <Heading className="text-white mb-6" size="xl">
              Give a name to your internet radio station
            </Heading>
          </Center>
          <form.Field name="name">
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
                    onBlur={field.handleBlur}
                    onChangeText={field.handleChange}
                    autoFocus
                    className="text-3xl text-white text-center font-bold placeholder:text-gray-400"
                    placeholder="Radio station name"
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
          <form.Field name="streamUrl">
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
                    onBlur={field.handleBlur}
                    onChangeText={field.handleChange}
                    autoFocus
                    className="text-3xl text-white text-center font-bold placeholder:text-gray-400"
                    placeholder="Stream URL"
                    textContentType="URL"
                    keyboardType="url"
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
          <form.Field name="homePageUrl">
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
                    onBlur={field.handleBlur}
                    onChangeText={field.handleChange}
                    autoFocus
                    className="text-3xl text-white text-center font-bold placeholder:text-gray-400"
                    placeholder="Homepage URL"
                    textContentType="URL"
                    keyboardType="url"
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
          <HStack className="mt-6 items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCancelPress}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">Cancel</Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={form.handleSubmit}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">Create</Text>
            </FadeOutScaleDown>
          </HStack>
        </VStack>
      </Box>
    </LinearGradient>
  );
}
