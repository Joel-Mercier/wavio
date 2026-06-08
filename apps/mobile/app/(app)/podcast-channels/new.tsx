import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import * as z from "zod";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import UrlInputField from "@/components/forms/UrlInputField";
import { Center } from "@/components/ui/center";
import { FormControl } from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { useCreatePodcastChannel } from "@/hooks/backend/usePodcasts";
import { logError } from "@/utils/log";

const newPodcastChannelSchema = z.object({
  url: z.url().trim(),
});

export default function NewPodcastChannelScreen() {
  const [gray300, gray400] = Uniwind.getCSSVariable([
    "--color-gray-300",
    "--color-gray-400",
  ]) as string[];
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const doCreatePodcastChannel = useCreatePodcastChannel();
  const form = useForm({
    defaultValues: {
      url: "",
    } as z.input<typeof newPodcastChannelSchema>,
    validators: {
      onChange: newPodcastChannelSchema,
    },
    onSubmit: async ({ value }) => {
      doCreatePodcastChannel.mutate(
        { ...value },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["podcasts"] });
            router.navigate("/(app)/(tabs)/(home)/podcasts");
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="success">
                  <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                  <ToastDescription>
                    {t("app.podcasts.newChannelSuccessMessage")}
                  </ToastDescription>
                </Toast>
              ),
            });
          },
          onError: (error) => {
            logError(error);
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="error">
                  <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                  <ToastDescription>
                    {t("app.podcasts.newChannelErrorMessage")}
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
      colors={[gray300, "transparent"]}
      className="h-full"
      style={{ height: "100%" }}
    >
      <KeyboardAvoidingView
        behavior="padding"
        style={{
          flex: 1,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          justifyContent: "center",
        }}
      >
        <VStack className="w-full px-6">
          <Center>
            <Heading className="text-white mb-6" size="xl">
              {t("app.podcasts.newChannelTitle")}
            </Heading>
          </Center>
          <form.Field name="url">
            {(field) => (
              <FormControl
                isInvalid={showFieldError(field)}
                size="md"
                isDisabled={false}
                isReadOnly={false}
                isRequired={false}
                className="mb-6"
              >
                <Input className="border-0 bg-primary-400 px-6 py-4">
                  <UrlInputField
                    value={field.state.value}
                    onBlur={() => handleFieldBlur(field)}
                    onChangeText={field.handleChange}
                    autoFocus
                    className="text-3xl text-white text-center font-bold"
                    placeholderTextColor={gray400}
                    placeholder={t("app.podcasts.channelUrlPlaceholder")}
                  />
                </Input>
                <FieldError field={field} />
              </FormControl>
            )}
          </form.Field>
          <HStack className="mt-6 items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCancelPress}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={form.handleSubmit}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.create")}
              </Text>
            </FadeOutScaleDown>
          </HStack>
        </VStack>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
