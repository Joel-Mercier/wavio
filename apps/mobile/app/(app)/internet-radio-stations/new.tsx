import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
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
import { Input, InputField } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { useCreateInternetRadioStation } from "@/hooks/backend/useInternetRadioStations";
import { logError } from "@/utils/log";
import { goBackOrHome } from "@/utils/navigation";

const newInternetRadioStationSchema = z.object({
  name: z.string().trim().min(1),
  streamUrl: z.url().trim(),
  homePageUrl: z.url().trim().or(z.literal("")).optional(),
});
export default function NewInternetRadioStationScreen() {
  const [gray300, gray400, primary800] = Uniwind.getCSSVariable([
    "--color-gray-300",
    "--color-gray-400",
    "--color-primary-800",
  ]) as string[];
  const { t } = useTranslation();
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
    } as z.input<typeof newInternetRadioStationSchema>,
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
                  <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                  <ToastDescription>
                    {t("app.internetRadioStations.newSuccessMessage")}
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
                    {t("app.internetRadioStations.newErrorMessage")}
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
    goBackOrHome(router);
  };

  return (
    <LinearGradient
      colors={[gray300, "transparent"]}
      className="h-full"
      style={{ height: "100%" }}
    >
      <KeyboardAwareScrollView
        bottomOffset={60}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          justifyContent: "center",
        }}
        showsVerticalScrollIndicator={false}
      >
        <VStack className="w-full px-6">
          <Center>
            <Heading className="text-white mb-6" size="xl">
              {t("app.internetRadioStations.newTitle")}
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
                <Input className="border border-primary-400 bg-primary-400 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 px-6 py-4">
                  <InputField
                    disableFullscreenUI
                    value={field.state.value}
                    onBlur={() => handleFieldBlur(field)}
                    onChangeText={field.handleChange}
                    autoFocus
                    className="text-2xl text-white font-bold"
                    placeholder={t("app.internetRadioStations.namePlaceholder")}
                    placeholderTextColor={gray400}
                  />
                </Input>
                <FieldError field={field} />
              </FormControl>
            )}
          </form.Field>
          <form.Field name="streamUrl">
            {(field) => (
              <FormControl
                isInvalid={showFieldError(field)}
                size="md"
                isDisabled={false}
                isReadOnly={false}
                isRequired={false}
                className="mb-6"
              >
                <Input className="border border-primary-400 bg-primary-400 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 px-6 py-4">
                  <UrlInputField
                    value={field.state.value}
                    onBlur={() => handleFieldBlur(field)}
                    onChangeText={field.handleChange}
                    className="text-2xl text-white font-bold"
                    placeholderTextColor={gray400}
                    placeholder={t(
                      "app.internetRadioStations.streamUrlPlaceholder",
                    )}
                  />
                </Input>
                <FieldError field={field} />
              </FormControl>
            )}
          </form.Field>
          <form.Field name="homePageUrl">
            {(field) => (
              <FormControl
                isInvalid={showFieldError(field)}
                size="md"
                isDisabled={false}
                isReadOnly={false}
                isRequired={false}
                className="mb-6"
              >
                <Input className="border border-primary-400 bg-primary-400 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 px-6 py-4">
                  <UrlInputField
                    value={field.state.value ?? ""}
                    onBlur={() => handleFieldBlur(field)}
                    onChangeText={field.handleChange}
                    className="text-2xl text-white font-bold"
                    placeholderTextColor={gray400}
                    placeholder={t(
                      "app.internetRadioStations.homePageUrlPlaceholder",
                    )}
                  />
                </Input>
                <FieldError field={field} />
              </FormControl>
            )}
          </form.Field>
          <HStack className="mt-6 items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCancelPress}
              disabled={doCreateInternetRadioStation.isPending}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={form.handleSubmit}
              disabled={doCreateInternetRadioStation.isPending}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              {doCreateInternetRadioStation.isPending ? (
                <Spinner color={primary800} />
              ) : (
                <Text className="text-primary-800 font-bold text-lg">
                  {t("app.shared.create")}
                </Text>
              )}
            </FadeOutScaleDown>
          </HStack>
        </VStack>
      </KeyboardAwareScrollView>
    </LinearGradient>
  );
}
