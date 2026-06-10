import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { Center } from "@/components/ui/center";
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
import { useCreatePlaylist } from "@/hooks/backend/usePlaylists";
import { logError } from "@/utils/log";

const newPlaylistSchema = z.object({
  name: z.string().trim().min(1),
});

export default function NewPlaylistScreen() {
  const [gray300, gray400] = Uniwind.getCSSVariable([
    "--color-gray-300",
    "--color-gray-400",
  ]) as string[];
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const doCreatePlaylist = useCreatePlaylist();
  const form = useForm({
    defaultValues: {
      name: "",
    },
    validators: {
      onChange: newPlaylistSchema,
    },
    onSubmit: async ({ value }) => {
      doCreatePlaylist.mutate(
        { ...value },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["playlists"] });
            if (returnTo === "add-to-playlist") {
              router.back();
            } else {
              router.navigate("/(app)/(tabs)/(library)");
            }
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="success">
                  <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                  <ToastDescription>
                    {t("app.newPlaylist.newPlaylistSuccessMessage")}
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
                    {t("app.newPlaylist.newPlaylistErrorMessage")}
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
              {t("app.newPlaylist.title")}
            </Heading>
          </Center>
          <form.Field name="name">
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
                  <InputField
                    value={field.state.value}
                    onBlur={() => handleFieldBlur(field)}
                    onChangeText={field.handleChange}
                    autoFocus
                    className="text-3xl text-white text-center font-bold rounded-md"
                    placeholder={t("app.newPlaylist.namePlaceholder")}
                    placeholderTextColor={gray400}
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
