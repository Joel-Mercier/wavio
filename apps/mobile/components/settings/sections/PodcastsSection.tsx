import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useForm, useSelector } from "@tanstack/react-form";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import { Uniwind } from "uniwind";
import * as z from "zod";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import SearchableSelectSheet from "@/components/SearchableSelectSheet";
import ConfirmActionDialog from "@/components/settings/ConfirmActionDialog";
import { SettingsSelectRow } from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { FormControl } from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useRemainingApiRequests } from "@/hooks/taddyPodcasts/useSystem";
import { useHighlightedSetting } from "@/hooks/useHighlightedSetting";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { TaddyError } from "@/services/taddyPodcasts/index";
import { validateTaddyCredentials } from "@/services/taddyPodcasts/system";
import { Country, Language } from "@/services/taddyPodcasts/types";
import usePodcasts, { usePodcastsBase } from "@/stores/podcasts";
import { cn } from "@/utils/tailwind";

const podcastCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1),
  userId: z.string().trim().min(1),
});

const enumLabel = (value: string) => value.replaceAll("_", " ");

const toOptions = (values: string[]) =>
  values.map((value) => ({ label: enumLabel(value), value }));

export default function PodcastsSection() {
  const { t } = useTranslation();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [emerald500] = Uniwind.getCSSVariable([
    "--color-emerald-500",
  ]) as string[];
  const bottomSheetCountryModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetLanguageModalRef = useRef<BottomSheetModal>(null);
  // The podcasts tab's footer card deep-links here pointing at the country /
  // language rows, which are what its recommendations are drawn from.
  const {
    scrollRef,
    highlighted: highlightRecommendations,
    onLayout: handleRecommendationsLayout,
  } = useHighlightedSetting("recommendations");

  const taddyPodcastsApiKey = usePodcasts((store) => store.taddyPodcastsApiKey);
  const taddyPodcastsUserId = usePodcasts((store) => store.taddyPodcastsUserId);
  const taddyPodcastsLanguage = usePodcasts(
    (store) => store.taddyPodcastsLanguage,
  );
  const taddyPodcastsCountry = usePodcasts(
    (store) => store.taddyPodcastsCountry,
  );
  const setTaddyPodcastsCredentials = usePodcasts(
    (store) => store.setTaddyPodcastsCredentials,
  );
  const setTaddyPodcastsLanguage = usePodcasts(
    (store) => store.setTaddyPodcastsLanguage,
  );
  const setTaddyPodcastsCountry = usePodcasts(
    (store) => store.setTaddyPodcastsCountry,
  );
  const clearTaddyPodcastsConfig = usePodcasts(
    (store) => store.clearTaddyPodcastsConfig,
  );

  const isConfigured = !!(taddyPodcastsApiKey && taddyPodcastsUserId);
  const { data: remainingApiRequests } = useRemainingApiRequests(isConfigured);

  const [isValidating, setIsValidating] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const countryOptions = useMemo(() => toOptions(Object.values(Country)), []);
  const languageOptions = useMemo(() => toOptions(Object.values(Language)), []);

  const form = useForm({
    defaultValues: {
      apiKey: taddyPodcastsApiKey,
      userId: taddyPodcastsUserId,
    },
    validators: { onChange: podcastCredentialsSchema },
    onSubmit: async ({ value }) => {
      const apiKey = value.apiKey.trim();
      const userId = value.userId.trim();
      setIsValidating(true);
      try {
        await validateTaddyCredentials(apiKey, userId);
      } catch (error) {
        showErrorToast(
          error instanceof TaddyError
            ? error.message
            : t("app.settings.podcastSettings.configurePodcastsErrorMessage"),
        );
        return;
      } finally {
        setIsValidating(false);
      }
      setTaddyPodcastsCredentials({ apiKey, userId });
      // Mark the form pristine so the Delete button (gated on !isDirty) shows
      // immediately after a successful save.
      form.reset({ apiKey, userId });
      showSuccessToast(
        t("app.settings.podcastSettings.configurePodcastsSuccessMessage"),
      );
    },
  });

  const isDirty = useSelector(form.store, (state) => state.isDirty);

  const handleRemove = () => {
    clearTaddyPodcastsConfig();
    const { taddyPodcastsApiKey: apiKey, taddyPodcastsUserId: userId } =
      usePodcastsBase.getState();
    form.reset({ apiKey, userId });
    setShowDeleteDialog(false);
    showSuccessToast(
      t("app.settings.podcastSettings.removePodcastConfigSuccessMessage"),
    );
  };

  return (
    <SettingsScreenScaffold
      title={t("app.settings.menu.podcasts.title")}
      scrollRef={scrollRef}
      overlays={
        <>
          <SearchableSelectSheet
            ref={bottomSheetCountryModalRef}
            title={t("app.settings.podcastSettings.countryLabel")}
            options={countryOptions}
            selectedValue={taddyPodcastsCountry}
            onSelect={(value) => {
              setTaddyPodcastsCountry(value as keyof typeof Country);
              bottomSheetCountryModalRef.current?.dismiss();
            }}
            emerald={emerald500}
          />
          <SearchableSelectSheet
            ref={bottomSheetLanguageModalRef}
            title={t("app.settings.podcastSettings.languageLabel")}
            options={languageOptions}
            selectedValue={taddyPodcastsLanguage}
            onSelect={(value) => {
              setTaddyPodcastsLanguage(value as keyof typeof Language);
              bottomSheetLanguageModalRef.current?.dismiss();
            }}
            emerald={emerald500}
          />
          <ConfirmActionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            title={t(
              "app.settings.podcastSettings.removePodcastConfigConfirmLabel",
            )}
            description={t(
              "app.settings.podcastSettings.removePodcastConfigConfirmDescription",
            )}
            cancelLabel={t("app.shared.cancel")}
            confirmLabel={t("app.shared.delete")}
            onConfirm={handleRemove}
          />
        </>
      }
    >
      <VStack className="gap-y-4">
        <HStack className="items-center justify-between py-2">
          <Text className="text-primary-100 text-sm w-3/5">
            {t("app.settings.podcastSettings.configurePodcastsDescription")}
          </Text>
          <Badge
            className={cn(
              "rounded-full normal-case py-1 px-3",
              isConfigured ? "bg-emerald-100" : "bg-primary-100",
            )}
            size="lg"
            variant="solid"
            action={isConfigured ? "success" : "muted"}
          >
            <BadgeText
              className={cn(
                "normal-case text-center",
                isConfigured ? "text-emerald-700" : "text-primary-700",
              )}
            >
              {isConfigured
                ? t("app.settings.podcastSettings.statuses.active")
                : t("app.settings.podcastSettings.statuses.inactive")}
            </BadgeText>
          </Badge>
        </HStack>

        {remainingApiRequests?.data?.getApiRequestsRemaining !== undefined && (
          <Text className="text-emerald-400 text-sm">
            {t("app.settings.podcastSettings.remainingApiRequests", {
              count: remainingApiRequests.data.getApiRequestsRemaining,
              total: 500,
            })}
          </Text>
        )}

        <Text
          className="text-emerald-400 text-sm underline self-start"
          onPress={() =>
            Linking.openURL("https://taddy.org/developers/podcast-api")
          }
        >
          {t("app.settings.podcastSettings.getApiKeyAction")}
        </Text>

        <form.Field name="userId">
          {(field) => (
            <FormControl isInvalid={showFieldError(field)} className="mt-2">
              <Heading className="text-white font-normal mb-2" size="sm">
                {t("app.settings.podcastSettings.userId")}
              </Heading>
              <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-4 py-2">
                <InputField
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={() => handleFieldBlur(field)}
                  className="text-md text-white"
                  placeholder={t(
                    "app.settings.podcastSettings.userIdPlaceholder",
                  )}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="numeric"
                />
              </Input>
              <FieldError field={field} />
            </FormControl>
          )}
        </form.Field>

        <form.Field name="apiKey">
          {(field) => (
            <FormControl isInvalid={showFieldError(field)} className="mt-2">
              <Heading className="text-white font-normal mb-2" size="sm">
                {t("app.settings.podcastSettings.apiKey")}
              </Heading>
              <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-4 py-2">
                <InputField
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={() => handleFieldBlur(field)}
                  className="text-md text-white"
                  placeholder={t(
                    "app.settings.podcastSettings.apiKeyPlaceholder",
                  )}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
              </Input>
              <FieldError field={field} />
            </FormControl>
          )}
        </form.Field>

        <HStack className="items-center justify-center gap-x-4 mt-2">
          <FadeOutScaleDown
            disabled={isValidating}
            onPress={() => {
              if (!isValidating) form.handleSubmit();
            }}
            className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
          >
            {isValidating ? (
              <Spinner color="rgb(41, 41, 41)" />
            ) : (
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.settings.podcastSettings.testAndSaveAction")}
              </Text>
            )}
          </FadeOutScaleDown>
          {isConfigured && !isDirty && (
            <FadeOutScaleDown
              onPress={() => setShowDeleteDialog(true)}
              className="items-center justify-center py-3 px-8 border border-red-500 bg-red-500 rounded-full"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.delete")}
              </Text>
            </FadeOutScaleDown>
          )}
        </HStack>

        <Box className="h-px bg-primary-500 my-2" />

        <Box onLayout={handleRecommendationsLayout}>
          <SettingsSelectRow
            label={t("app.settings.podcastSettings.countryLabel")}
            description={t("app.settings.podcastSettings.countryDescription")}
            badgeText={enumLabel(taddyPodcastsCountry)}
            disabled={!isConfigured}
            highlighted={highlightRecommendations}
            onPress={() => bottomSheetCountryModalRef.current?.present()}
          />
        </Box>
        <SettingsSelectRow
          label={t("app.settings.podcastSettings.languageLabel")}
          description={t("app.settings.podcastSettings.languageDescription")}
          badgeText={enumLabel(taddyPodcastsLanguage)}
          disabled={!isConfigured}
          onPress={() => bottomSheetLanguageModalRef.current?.present()}
        />
      </VStack>
    </SettingsScreenScaffold>
  );
}
