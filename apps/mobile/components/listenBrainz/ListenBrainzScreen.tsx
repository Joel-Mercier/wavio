import { useForm, useSelector } from "@tanstack/react-form";
import ChevronRight from "lucide-react-native/dist/esm/icons/chevron-right.mjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import { Uniwind } from "uniwind";
import * as z from "zod";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import UrlInputField from "@/components/forms/UrlInputField";
import {
  SettingsActionRow,
  SettingsSectionTitle,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
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
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { validateToken } from "@/services/listenBrainz/client";
import { drainListenQueue } from "@/services/listenBrainz/scrobbler";
import { refreshServerScrobbleState } from "@/services/listenBrainz/serverState";
import useListenBrainz, {
  isListenBrainzConnected,
  LISTENBRAINZ_DEFAULT_BASE_URL,
} from "@/stores/listenBrainz";
import { cn } from "@/utils/tailwind";

const LISTENBRAINZ_SETTINGS_URL = "https://listenbrainz.org/settings/";

const listenBrainzConfigSchema = z.object({
  token: z.string().trim().min(1),
  baseUrl: z.union([z.literal(""), z.url()]),
});

export default function ListenBrainzScreen() {
  const { t } = useTranslation();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [primary50] = Uniwind.getCSSVariable([
    "--color-primary-50",
  ]) as string[];

  const storedToken = useListenBrainz((store) => store.token);
  const storedBaseUrl = useListenBrainz((store) => store.baseUrl);
  const userName = useListenBrainz((store) => store.userName);
  const scrobblingEnabled = useListenBrainz((store) => store.scrobblingEnabled);
  const submitNowPlaying = useListenBrainz((store) => store.submitNowPlaying);
  const serverIsScrobbling = useListenBrainz(
    (store) => store.serverIsScrobbling,
  );
  const queuedCount = useListenBrainz((store) => store.queue.length);
  const setConfig = useListenBrainz((store) => store.setConfig);
  const setBaseUrl = useListenBrainz((store) => store.setBaseUrl);
  const setScrobblingEnabled = useListenBrainz(
    (store) => store.setScrobblingEnabled,
  );
  const setSubmitNowPlaying = useListenBrainz(
    (store) => store.setSubmitNowPlaying,
  );
  const clearConfig = useListenBrainz((store) => store.clearConfig);

  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const isConnected = storedToken.length > 0 && userName !== null;

  // Ask the server whether it is already scrobbling, so the warning below is
  // current rather than whatever the last visit recorded.
  useEffect(() => {
    void refreshServerScrobbleState();
  }, []);

  const form = useForm({
    defaultValues: {
      token: storedToken,
      baseUrl:
        storedBaseUrl === LISTENBRAINZ_DEFAULT_BASE_URL ? "" : storedBaseUrl,
    },
    validators: { onChange: listenBrainzConfigSchema },
    onSubmit: async ({ value }) => {
      const token = value.token.trim();
      const baseUrl = value.baseUrl.trim() || LISTENBRAINZ_DEFAULT_BASE_URL;
      const wasConnected = isListenBrainzConnected();
      setIsTesting(true);
      try {
        const result = await validateToken(token, baseUrl);
        if (!result.valid) {
          showErrorToast(
            t("app.settings.integrations.listenbrainz.tokenRejected"),
          );
          return;
        }
        setBaseUrl(baseUrl);
        setConfig({ token, userName: result.userName });
        // Default scrobbling on, unless the server is already doing it for this
        // user — in which case turning it on would count every play twice, so
        // the user has to opt in deliberately. Only on the *first* connection:
        // re-entering a rotated token must not silently undo a choice the user
        // already made, least of all when the server is unreachable and
        // refreshServerScrobbleState can only answer null.
        if (!wasConnected) {
          const alreadyScrobbling = await refreshServerScrobbleState();
          setScrobblingEnabled(alreadyScrobbling !== true);
        } else {
          void refreshServerScrobbleState();
        }
        form.reset({ token, baseUrl: value.baseUrl.trim() });
        showSuccessToast(
          t("app.settings.integrations.listenbrainz.connectionSuccess", {
            userName: result.userName,
          }),
        );
      } catch {
        showErrorToast(
          t("app.settings.integrations.listenbrainz.connectionFailed"),
        );
      } finally {
        setIsTesting(false);
      }
    },
  });

  const isDirty = useSelector(form.store, (state) => state.isDirty);

  const handleRemove = () => {
    clearConfig();
    form.reset({ token: "", baseUrl: "" });
    showSuccessToast(
      t("app.settings.integrations.listenbrainz.removedMessage"),
    );
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await drainListenQueue();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <SettingsScreenScaffold
      title={t("app.settings.integrations.listenbrainz.title")}
    >
      <VStack className="gap-y-4">
        <HStack className="items-center justify-between py-2">
          <Text className="text-primary-100 text-sm w-3/5">
            {t("app.settings.integrations.listenbrainz.description")}
          </Text>
          <Badge
            className={cn(
              "rounded-full normal-case py-1 px-3",
              isConnected ? "bg-emerald-100" : "bg-primary-100",
            )}
            size="lg"
            variant="solid"
            action={isConnected ? "success" : "muted"}
          >
            <BadgeText
              className={cn(
                "normal-case text-center",
                isConnected ? "text-emerald-700" : "text-primary-700",
              )}
            >
              {isConnected
                ? t("app.settings.integrations.statuses.configured")
                : t("app.settings.integrations.statuses.notConfigured")}
            </BadgeText>
          </Badge>
        </HStack>

        {isConnected && userName && (
          <Text className="text-primary-100 text-sm">
            {t("app.settings.integrations.listenbrainz.signedInAs", {
              userName,
            })}
          </Text>
        )}

        <FadeOutScaleDown
          onPress={() => {
            void Linking.openURL(LISTENBRAINZ_SETTINGS_URL);
          }}
          className="self-start"
        >
          <Text className="text-emerald-400 text-sm underline">
            {t("app.settings.integrations.listenbrainz.getTokenAction")}
          </Text>
        </FadeOutScaleDown>

        <form.Field name="token">
          {(field) => (
            <FormControl isInvalid={showFieldError(field)} className="mt-2">
              <Heading className="text-white font-normal mb-2" size="sm">
                {t("app.settings.integrations.listenbrainz.tokenLabel")}
              </Heading>
              <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-4 py-2">
                <InputField
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={() => handleFieldBlur(field)}
                  className="text-md text-white"
                  placeholder={t(
                    "app.settings.integrations.listenbrainz.tokenPlaceholder",
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

        <form.Field name="baseUrl">
          {(field) => (
            <FormControl isInvalid={showFieldError(field)} className="mt-2">
              <Heading className="text-white font-normal mb-2" size="sm">
                {t("app.settings.integrations.listenbrainz.baseUrlLabel")}
              </Heading>
              <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-4 py-2">
                <UrlInputField
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={() => handleFieldBlur(field)}
                  placeholder={LISTENBRAINZ_DEFAULT_BASE_URL}
                  placeholderTextColor={primary50}
                />
              </Input>
              <Text className="text-primary-100 text-xs mt-1">
                {t("app.settings.integrations.listenbrainz.baseUrlDescription")}
              </Text>
              <FieldError field={field} />
            </FormControl>
          )}
        </form.Field>

        <HStack className="items-center justify-center gap-x-4 mt-2">
          <FadeOutScaleDown
            disabled={isTesting}
            onPress={() => {
              if (!isTesting) form.handleSubmit();
            }}
            className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
          >
            {isTesting ? (
              <Spinner color="rgb(41, 41, 41)" />
            ) : (
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.settings.integrations.listenbrainz.connectAction")}
              </Text>
            )}
          </FadeOutScaleDown>
          {isConnected && !isDirty && (
            <FadeOutScaleDown
              onPress={handleRemove}
              className="items-center justify-center py-3 px-8 border border-red-500 bg-red-500 rounded-full"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.delete")}
              </Text>
            </FadeOutScaleDown>
          )}
        </HStack>

        {isConnected && (
          <>
            <Box className="h-px bg-primary-500 my-2" />

            <FadeOutScaleDown href="/integrations/listenbrainz-stats">
              <HStack className="items-center gap-x-4 py-4">
                <VStack className="gap-y-1 flex-1">
                  <Heading className="text-white font-normal" size="md">
                    {t(
                      "app.settings.integrations.listenbrainz.stats.entryLabel",
                    )}
                  </Heading>
                  <Text className="text-primary-100 text-sm">
                    {t(
                      "app.settings.integrations.listenbrainz.stats.entryDescription",
                    )}
                  </Text>
                </VStack>
                <ChevronRight size={20} color={primary50} />
              </HStack>
            </FadeOutScaleDown>

            <SettingsSectionTitle
              title={t(
                "app.settings.integrations.listenbrainz.scrobbling.title",
              )}
            />

            {serverIsScrobbling === true && (
              <Box className="border border-amber-500 bg-amber-500/10 rounded-md p-4">
                <Text className="text-amber-300 text-sm">
                  {t(
                    "app.settings.integrations.listenbrainz.scrobbling.serverWarning",
                  )}
                </Text>
              </Box>
            )}

            <SettingsToggleRow
              label={t(
                "app.settings.integrations.listenbrainz.scrobbling.enabledLabel",
              )}
              description={t(
                "app.settings.integrations.listenbrainz.scrobbling.enabledDescription",
              )}
              value={scrobblingEnabled}
              onToggle={setScrobblingEnabled}
            />

            <SettingsToggleRow
              label={t(
                "app.settings.integrations.listenbrainz.scrobbling.nowPlayingLabel",
              )}
              description={t(
                "app.settings.integrations.listenbrainz.scrobbling.nowPlayingDescription",
              )}
              value={submitNowPlaying}
              onToggle={setSubmitNowPlaying}
              disabled={!scrobblingEnabled}
            />

            <SettingsActionRow
              label={t(
                "app.settings.integrations.listenbrainz.queue.pendingLabel",
              )}
              description={
                queuedCount === 0
                  ? t(
                      "app.settings.integrations.listenbrainz.queue.pendingDescriptionEmpty",
                    )
                  : t(
                      "app.settings.integrations.listenbrainz.queue.pendingDescription",
                      { count: queuedCount },
                    )
              }
              actionLabel={t(
                isSyncing
                  ? "app.settings.integrations.listenbrainz.queue.syncingAction"
                  : "app.settings.integrations.listenbrainz.queue.syncAction",
              )}
              onPress={() => {
                void handleSyncNow();
              }}
              layout="wide"
              disabled={isSyncing || queuedCount === 0}
            />
          </>
        )}
      </VStack>
    </SettingsScreenScaffold>
  );
}
