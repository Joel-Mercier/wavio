import { useForm, useStore } from "@tanstack/react-form";
import ChevronDownIcon from "lucide-react-native/dist/esm/icons/chevron-down.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Uniwind } from "uniwind";
import * as z from "zod";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Box } from "@/components/ui/box";
import { FormControl } from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import {
  Select,
  SelectBackdrop,
  SelectContent,
  SelectDragIndicator,
  SelectDragIndicatorWrapper,
  SelectFlatList,
  SelectIcon,
  SelectInput,
  SelectItem,
  SelectPortal,
  SelectTrigger,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { TaddyError } from "@/services/taddyPodcasts/index";
import { validateTaddyCredentials } from "@/services/taddyPodcasts/system";
import { Country, Language } from "@/services/taddyPodcasts/types";
import usePodcasts from "@/stores/podcasts";

const podcastConfigSchema = z.object({
  apiKey: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  language: z.enum(Language),
  country: z.enum(Country),
});

function SelectSearchInput({
  onChangeText,
}: {
  onChangeText: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [primary50] = Uniwind.getCSSVariable([
    "--color-primary-50",
  ]) as string[];
  const form = useForm({ defaultValues: { query: "" } });
  const query = useStore(form.store, (state) => state.values.query);

  useEffect(() => {
    onChangeText(query);
  }, [query, onChangeText]);

  return (
    <Box className="px-2 pb-2">
      <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 rounded-md px-4">
        <form.Field name="query">
          {(field) => (
            <InputField
              value={field.state.value}
              onChangeText={field.handleChange}
              className="text-md text-white"
              placeholder={t("app.shared.search")}
              placeholderTextColor={primary50}
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}
        </form.Field>
        {query.length > 0 && (
          <InputSlot
            className="pl-2"
            onPress={() => form.setFieldValue("query", "")}
          >
            <InputIcon as={X} />
          </InputSlot>
        )}
      </Input>
    </Box>
  );
}

export default function PodcastConfigDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const setTaddyPodcastsConfig = usePodcasts(
    (store) => store.setTaddyPodcastsConfig,
  );
  const taddyPodcastApiKey = usePodcasts((store) => store.taddyPodcastsApiKey);
  const taddyPodcastUserId = usePodcasts((store) => store.taddyPodcastsUserId);
  const taddyPodcastLanguage = usePodcasts(
    (store) => store.taddyPodcastsLanguage,
  );
  const taddyPodcastCountry = usePodcasts(
    (store) => store.taddyPodcastsCountry,
  );
  const [countryQuery, setCountryQuery] = useState("");
  const [languageQuery, setLanguageQuery] = useState("");

  const countryOptions = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    const all = Object.values(Country) as string[];
    return q ? all.filter((c) => c.toLowerCase().includes(q)) : all;
  }, [countryQuery]);
  const languageOptions = useMemo(() => {
    const q = languageQuery.trim().toLowerCase();
    const all = Object.values(Language) as string[];
    return q ? all.filter((l) => l.toLowerCase().includes(q)) : all;
  }, [languageQuery]);

  const podcastConfigForm = useForm({
    defaultValues: {
      apiKey: taddyPodcastApiKey,
      userId: taddyPodcastUserId,
      language: taddyPodcastLanguage,
      country: taddyPodcastCountry,
    },
    validators: {
      onChange: podcastConfigSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        await validateTaddyCredentials(value.apiKey, value.userId);
      } catch (error) {
        toast.show({
          placement: "top",
          duration: 4000,
          render: () => (
            <Toast action="error">
              <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
              <ToastDescription>
                {error instanceof TaddyError
                  ? error.message
                  : t(
                      "app.settings.podcastSettings.configurePodcastsErrorMessage",
                    )}
              </ToastDescription>
            </Toast>
          ),
        });
        return;
      }
      setTaddyPodcastsConfig(value);
      onClose();
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t(
                "app.settings.podcastSettings.configurePodcastsSuccessMessage",
              )}
            </ToastDescription>
          </Toast>
        ),
      });
    },
  });

  const isPodcastConfigDirty = useStore(
    podcastConfigForm.store,
    (state) => state.isDirty,
  );
  const isValidating = useStore(
    podcastConfigForm.store,
    (state) => state.isSubmitting,
  );

  return (
    <AlertDialog isOpen={isOpen} onClose={onClose} size="md">
      <AlertDialogBackdrop />
      <KeyboardAvoidingView
        behavior="padding"
        style={{ width: "100%", alignItems: "center" }}
      >
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.settings.podcastSettings.podcastConfigFormTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody
            className="mt-3 mb-4"
            showsVerticalScrollIndicator={false}
          >
            <Text className="text-primary-50" size="sm">
              {t("app.settings.podcastSettings.podcastConfigFormDescription")}
            </Text>
            <podcastConfigForm.Field name="userId">
              {(field) => (
                <FormControl
                  isInvalid={showFieldError(field)}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={() => handleFieldBlur(field)}
                      className="text-md text-white"
                      placeholder={t(
                        "app.settings.podcastSettings.userIdPlaceholder",
                      )}
                      autoCapitalize="none"
                      keyboardType="numeric"
                    />
                  </Input>
                  <FieldError field={field} />
                </FormControl>
              )}
            </podcastConfigForm.Field>
            <podcastConfigForm.Field name="apiKey">
              {(field) => (
                <FormControl
                  isInvalid={showFieldError(field)}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={() => handleFieldBlur(field)}
                      className="text-md text-white"
                      placeholder={t(
                        "app.settings.podcastSettings.apiKeyPlaceholder",
                      )}
                      autoCapitalize="none"
                      secureTextEntry
                    />
                  </Input>
                  <FieldError field={field} />
                </FormControl>
              )}
            </podcastConfigForm.Field>
            <podcastConfigForm.Field name="country">
              {(field) => (
                <FormControl
                  isInvalid={showFieldError(field)}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Select
                    selectedValue={taddyPodcastCountry}
                    onValueChange={(value) =>
                      field.handleChange(value as keyof typeof Country)
                    }
                    onClose={() => handleFieldBlur(field)}
                    closeOnOverlayClick
                    isInvalid={showFieldError(field)}
                  >
                    <SelectTrigger className="bg-primary-600 border border-primary-600 rounded-md px-6 py-3 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500">
                      <SelectInput
                        className="flex-1 text-md text-white"
                        placeholder={t(
                          "app.settings.podcastSettings.countryPlaceholder",
                        )}
                      />
                      <SelectIcon className="mr-3" as={ChevronDownIcon} />
                    </SelectTrigger>
                    <SelectPortal>
                      <SelectBackdrop />
                      <SelectContent
                        style={{ backgroundColor: "rgb(41, 41, 41)" }}
                      >
                        <SelectDragIndicatorWrapper>
                          <SelectDragIndicator />
                        </SelectDragIndicatorWrapper>
                        <SelectSearchInput onChangeText={setCountryQuery} />
                        <SelectFlatList
                          data={countryOptions}
                          keyExtractor={(item) => item as string}
                          renderItem={({ item }) => (
                            <SelectItem
                              label={(item as string).replaceAll("_", " ")}
                              value={item as string}
                              textStyle={{
                                className: "text-white",
                              }}
                            />
                          )}
                        />
                      </SelectContent>
                    </SelectPortal>
                  </Select>
                  <FieldError field={field} />
                </FormControl>
              )}
            </podcastConfigForm.Field>
            <podcastConfigForm.Field name="language">
              {(field) => (
                <FormControl
                  isInvalid={showFieldError(field)}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Select
                    selectedValue={taddyPodcastLanguage}
                    onValueChange={(value) =>
                      field.handleChange(value as keyof typeof Language)
                    }
                    onClose={() => handleFieldBlur(field)}
                    closeOnOverlayClick
                    isInvalid={showFieldError(field)}
                  >
                    <SelectTrigger className="bg-primary-600 border border-primary-600 rounded-md px-6 py-3 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500">
                      <SelectInput
                        className="flex-1 text-md text-white"
                        placeholder={t(
                          "app.settings.podcastSettings.languagePlaceholder",
                        )}
                      />
                      <SelectIcon className="mr-3" as={ChevronDownIcon} />
                    </SelectTrigger>
                    <SelectPortal>
                      <SelectBackdrop />
                      <SelectContent
                        style={{ backgroundColor: "rgb(41, 41, 41)" }}
                      >
                        <SelectDragIndicatorWrapper>
                          <SelectDragIndicator />
                        </SelectDragIndicatorWrapper>
                        <SelectSearchInput onChangeText={setLanguageQuery} />
                        <SelectFlatList
                          data={languageOptions}
                          keyExtractor={(item) => item as string}
                          renderItem={({ item }) => (
                            <SelectItem
                              label={(item as string).replaceAll("_", " ")}
                              value={item as string}
                              textStyle={{
                                className: "text-white",
                              }}
                            />
                          )}
                        />
                      </SelectContent>
                    </SelectPortal>
                  </Select>
                  <FieldError field={field} />
                </FormControl>
              )}
            </podcastConfigForm.Field>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={onClose}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              disabled={isValidating}
              onPress={() => {
                if (isPodcastConfigDirty && !isValidating)
                  podcastConfigForm.handleSubmit();
              }}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              {isValidating ? (
                <Spinner color="rgb(41, 41, 41)" />
              ) : (
                <Text className="text-primary-800 font-bold text-lg">
                  {t("app.shared.save")}
                </Text>
              )}
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </KeyboardAvoidingView>
    </AlertDialog>
  );
}
