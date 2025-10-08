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
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useCreatePlaylist } from "@/hooks/openSubsonic/usePlaylists";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { AlertCircleIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import z from "zod";

const newPlaylistSchema = z.object({
  name: z.string().trim().min(1),
});

export default function NewPlaylistScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const doCreatePlaylist = useCreatePlaylist();
  const form = useForm({
    defaultValues: {
      name: "",
    },
    validators: {
      onBlur: newPlaylistSchema,
    },
    onSubmit: async ({ value }) => {
      doCreatePlaylist.mutate(
        { ...value },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["playlists"] });
            router.navigate("/(app)/(tabs)/(library)");
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
            console.error(error);
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
              {t("app.newPlaylist.title")}
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
                    placeholder={t("app.newPlaylist.namePlaceholder")}
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
      </Box>
    </LinearGradient>
  );
}
