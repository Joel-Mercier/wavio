import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useForm, useSelector } from "@tanstack/react-form";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import * as z from "zod";
import AudioMuseTokenHelpDialog from "@/components/audiomuse/AudioMuseTokenHelpDialog";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import UrlInputField from "@/components/forms/UrlInputField";
import OptionsBottomSheetModal, {
  type SheetOption,
} from "@/components/settings/OptionsBottomSheetModal";
import {
  SettingsActionRow,
  SettingsSectionTitle,
  SettingsSelectRow,
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
import {
  AudioMuseUnauthorizedError,
  connect,
  probeFeatures,
} from "@/services/audioMuse/system";
import useAudioMuse, {
  AUDIOMUSE_AI_PROVIDERS,
  type AudioMuseAiProvider,
  type AudioMuseFeatures,
  type AudioMuseSaveTarget,
  needsFingerprintCredentials,
  selectAiProvider,
  selectLyricsPathAvailable,
  selectSimilarArtistsAvailable,
  selectSimilarTracksAvailable,
} from "@/stores/audioMuse";
import useAuth from "@/stores/auth";
import { cn } from "@/utils/tailwind";

function connectionErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  return error instanceof AudioMuseUnauthorizedError
    ? t("app.settings.integrations.audiomuse.tokenRejected")
    : t("app.settings.integrations.audiomuse.connectionFailed");
}

// The token is optional: a deployment running with AUTH_ENABLED=false issues
// none, and sending an empty Bearer header would be rejected by one that does.
const audioMuseConfigSchema = z.object({
  serverUrl: z.string().trim().min(1),
  apiToken: z.string().trim(),
});

function FeatureRow({
  label,
  detail,
  hint,
  available,
}: {
  label: string;
  detail?: string;
  /** Shown only when the feature is available: where in the app to reach it. */
  hint?: string;
  available: boolean;
}) {
  const { t } = useTranslation();
  return (
    <HStack className="items-center justify-between py-3">
      <VStack className="flex-1 pr-4 gap-y-1">
        <Text className="text-white text-md">{label}</Text>
        {!!detail && <Text className="text-primary-100 text-sm">{detail}</Text>}
        {available && !!hint && (
          <Text className="text-primary-100 text-sm">{hint}</Text>
        )}
      </VStack>
      <Badge
        className={cn(
          "rounded-full normal-case py-1 px-3",
          available ? "bg-emerald-100" : "bg-primary-100",
        )}
        size="lg"
        variant="solid"
        action={available ? "success" : "muted"}
      >
        <BadgeText
          className={cn(
            "normal-case text-center",
            available ? "text-emerald-700" : "text-primary-700",
          )}
        >
          {available
            ? t("app.settings.integrations.audiomuse.features.available")
            : t("app.settings.integrations.audiomuse.features.unavailable")}
        </BadgeText>
      </Badge>
    </HStack>
  );
}

export default function AudioMuseScreen() {
  const { t } = useTranslation();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [primary50] = Uniwind.getCSSVariable([
    "--color-primary-50",
  ]) as string[];

  const storedServerUrl = useAudioMuse((store) => store.serverUrl);
  const storedApiToken = useAudioMuse((store) => store.apiToken);
  const isConnected = useAudioMuse((store) => store.isConnected);
  const serverId = useAudioMuse((store) => store.serverId);
  const availableServers = useAudioMuse((store) => store.availableServers);
  const clapEnabled = useAudioMuse((store) => store.clapEnabled);
  const lyricsEnabled = useAudioMuse((store) => store.lyricsEnabled);
  const aiProvider = useAudioMuse((store) => store.aiProvider);
  const analyzedTrackCount = useAudioMuse((store) => store.analyzedTrackCount);
  const aiProviderOverride = useAudioMuse((store) => store.aiProviderOverride);
  const setAiProviderOverride = useAudioMuse(
    (store) => store.setAiProviderOverride,
  );
  const saveTarget = useAudioMuse((store) => store.saveTarget);
  const fingerprintEnabled = useAudioMuse((store) => store.fingerprintEnabled);
  const artistSimilarityEnabled = useAudioMuse(
    (store) => store.artistSimilarityEnabled,
  );
  const semGroveEnabled = useAudioMuse((store) => store.semGroveEnabled);
  const fingerprintServerType = useAudioMuse(
    (store) => store.fingerprintServerType,
  );
  const fingerprintDefaultUser = useAudioMuse(
    (store) => store.fingerprintDefaultUser,
  );
  const fingerprintUser = useAudioMuse((store) => store.fingerprintUser);
  const fingerprintSecret = useAudioMuse((store) => store.fingerprintSecret);
  const setFingerprintCredentials = useAudioMuse(
    (store) => store.setFingerprintCredentials,
  );
  const accountUsername = useAuth((store) => store.username);
  const setConfig = useAudioMuse((store) => store.setConfig);
  const setConnected = useAudioMuse((store) => store.setConnected);
  const setFeatures = useAudioMuse((store) => store.setFeatures);
  const setServerId = useAudioMuse((store) => store.setServerId);
  const setSaveTarget = useAudioMuse((store) => store.setSaveTarget);
  const clearConfig = useAudioMuse((store) => store.clearConfig);

  const [isTesting, setIsTesting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Drafts rather than a form: there is nothing to validate beyond "not empty",
  // and the connection form's submit runs connect(), which these must not.
  const [fingerprintUserDraft, setFingerprintUserDraft] = useState(
    () => fingerprintUser || fingerprintDefaultUser || accountUsername || "",
  );
  const [fingerprintSecretDraft, setFingerprintSecretDraft] =
    useState(fingerprintSecret);
  const [isTokenHelpOpen, setIsTokenHelpOpen] = useState(false);
  const serverSheetRef = useRef<BottomSheetModal>(null);
  const saveTargetSheetRef = useRef<BottomSheetModal>(null);
  const aiProviderSheetRef = useRef<BottomSheetModal>(null);

  const effectiveAiProvider = selectAiProvider({
    aiProvider,
    aiProviderOverride,
  });

  const fingerprintNeedsCredentials = needsFingerprintCredentials(
    fingerprintServerType,
  );
  // Emby shares Jellyfin's fields (an identifier plus an API token); Navidrome
  // and the Subsonic-family servers behind it take a username and a password.
  const fingerprintCredentialStyle =
    fingerprintServerType === "navidrome" ? "navidrome" : "jellyfin";

  // A default account only shows up once the deployment has been probed, which
  // can be after this screen mounted (Refresh, or a first connect).
  useEffect(() => {
    if (fingerprintUser) return;
    setFingerprintUserDraft(
      (draft) => draft || fingerprintDefaultUser || accountUsername || "",
    );
  }, [fingerprintUser, fingerprintDefaultUser, accountUsername]);

  // Null is "the deployment didn't say", which must not read as zero: an older
  // AudioMuse with no dashboard snapshot would otherwise be accused of an
  // unscanned library.
  const libraryDetail =
    analyzedTrackCount == null
      ? t("app.settings.integrations.audiomuse.features.libraryUnknown")
      : analyzedTrackCount === 0
        ? t("app.settings.integrations.audiomuse.features.libraryNotAnalyzed")
        : t("app.settings.integrations.audiomuse.features.libraryAnalyzed", {
            count: analyzedTrackCount,
          });

  const similarTracksAvailable = selectSimilarTracksAvailable({
    isConnected,
    analyzedTrackCount,
  });

  const similarArtistsAvailable = selectSimilarArtistsAvailable({
    isConnected,
    artistSimilarityEnabled,
    analyzedTrackCount,
  });

  // The path rides on the same core index as similar tracks, so it is available
  // whenever they are; only its lyrics *option* needs the extra index, which the
  // detail line names rather than hiding the whole feature over.
  const lyricsPathAvailable = selectLyricsPathAvailable({
    isConnected,
    analyzedTrackCount,
    semGroveEnabled,
  });

  const form = useForm({
    defaultValues: {
      serverUrl: storedServerUrl,
      apiToken: storedApiToken,
    },
    validators: { onChange: audioMuseConfigSchema },
    onSubmit: async ({ value }) => {
      const serverUrl = value.serverUrl.trim();
      const apiToken = value.apiToken.trim();
      setIsTesting(true);
      let features: Partial<AudioMuseFeatures>;
      try {
        features = await connect({ serverUrl, apiToken });
      } catch (error) {
        setConnected(false);
        showErrorToast(connectionErrorMessage(error, t));
        return;
      } finally {
        setIsTesting(false);
      }
      setConfig({ serverUrl, apiToken });
      setConnected(true);
      setFeatures(features);
      // Mark the form pristine so the Remove button (gated on !isDirty) shows
      // immediately after a successful save.
      form.reset({ serverUrl, apiToken });
      showSuccessToast(
        t("app.settings.integrations.audiomuse.connectionSuccess"),
      );
    },
  });

  const isDirty = useSelector(form.store, (state) => state.isDirty);

  const handleRemove = () => {
    clearConfig();
    form.reset({ serverUrl: "", apiToken: "" });
    setFingerprintUserDraft("");
    setFingerprintSecretDraft("");
    showSuccessToast(t("app.settings.integrations.audiomuse.removedMessage"));
  };

  const handleSaveFingerprintCredentials = () => {
    setFingerprintCredentials({
      user: fingerprintUserDraft.trim(),
      secret: fingerprintSecretDraft.trim(),
    });
    showSuccessToast(
      t("app.settings.integrations.audiomuse.fingerprint.saved"),
    );
  };

  const handleRefreshFeatures = async () => {
    setIsRefreshing(true);
    try {
      setFeatures(
        await probeFeatures({
          serverUrl: storedServerUrl,
          apiToken: storedApiToken,
        }),
      );
      showSuccessToast(
        t("app.settings.integrations.audiomuse.features.refreshed"),
      );
    } catch (error) {
      // A token revoked since the last connect surfaces here first; drop the
      // connected flag so the rest of the app stops calling out with it.
      if (error instanceof AudioMuseUnauthorizedError) setConnected(false);
      showErrorToast(connectionErrorMessage(error, t));
    } finally {
      setIsRefreshing(false);
    }
  };

  const serverOptions: SheetOption<string | null>[] = useMemo(
    () => [
      {
        value: null,
        label: t("app.settings.integrations.audiomuse.server.defaultOption"),
      },
      ...availableServers.map((server) => ({
        value: server.id,
        label: server.name,
      })),
    ],
    [availableServers, t],
  );

  // AudioMuse never exposes which providers hold credentials (its API refuses to
  // echo API keys back), so every provider it supports is offered and a missing
  // key surfaces as a generation error rather than a hidden option.
  const aiProviderOptions: SheetOption<AudioMuseAiProvider | null>[] = useMemo(
    () => [
      {
        value: null,
        label: t("app.settings.integrations.audiomuse.aiProvider.autoOption"),
        description: aiProvider
          ? t("app.settings.integrations.audiomuse.aiProvider.autoDetail", {
              provider: aiProvider,
            })
          : undefined,
      },
      ...AUDIOMUSE_AI_PROVIDERS.map((provider) => ({
        value: provider,
        label: provider,
      })),
    ],
    [aiProvider, t],
  );

  const saveTargetOptions: SheetOption<AudioMuseSaveTarget>[] = useMemo(
    () => [
      {
        value: "wavio",
        label: t("app.settings.integrations.audiomuse.saveTarget.wavio"),
        description: t(
          "app.settings.integrations.audiomuse.saveTarget.wavioDescription",
        ),
      },
      {
        value: "audiomuse",
        label: t("app.settings.integrations.audiomuse.saveTarget.audiomuse"),
        description: t(
          "app.settings.integrations.audiomuse.saveTarget.audiomuseDescription",
        ),
      },
    ],
    [t],
  );

  const selectedServerLabel =
    serverOptions.find((option) => option.value === serverId)?.label ??
    t("app.settings.integrations.audiomuse.server.defaultOption");

  return (
    <SettingsScreenScaffold
      title={t("app.settings.integrations.audiomuse.title")}
      overlays={
        <>
          <AudioMuseTokenHelpDialog
            isOpen={isTokenHelpOpen}
            onClose={() => setIsTokenHelpOpen(false)}
          />
          <OptionsBottomSheetModal
            modalRef={serverSheetRef}
            options={serverOptions}
            selectedValue={serverId}
            onSelect={setServerId}
            header={t("app.settings.integrations.audiomuse.server.label")}
            headerDescription={t(
              "app.settings.integrations.audiomuse.server.description",
            )}
            dismissOnSelect
          />
          <OptionsBottomSheetModal
            modalRef={aiProviderSheetRef}
            options={aiProviderOptions}
            selectedValue={aiProviderOverride}
            onSelect={setAiProviderOverride}
            header={t("app.settings.integrations.audiomuse.aiProvider.label")}
            headerDescription={t(
              "app.settings.integrations.audiomuse.aiProvider.description",
            )}
            dismissOnSelect
          />
          <OptionsBottomSheetModal
            modalRef={saveTargetSheetRef}
            options={saveTargetOptions}
            selectedValue={saveTarget}
            onSelect={setSaveTarget}
            header={t("app.settings.integrations.audiomuse.saveTarget.label")}
            headerDescription={t(
              "app.settings.integrations.audiomuse.saveTarget.description",
            )}
            dismissOnSelect
          />
        </>
      }
    >
      <VStack className="gap-y-4">
        <HStack className="items-center justify-between py-2">
          <Text className="text-primary-100 text-sm w-3/5">
            {t("app.settings.integrations.audiomuse.description")}
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

        <FadeOutScaleDown
          onPress={() => setIsTokenHelpOpen(true)}
          className="self-start"
        >
          <Text className="text-emerald-400 text-sm underline">
            {t("app.settings.integrations.audiomuse.getTokenAction")}
          </Text>
        </FadeOutScaleDown>

        <form.Field name="serverUrl">
          {(field) => (
            <FormControl isInvalid={showFieldError(field)} className="mt-2">
              <Heading className="text-white font-normal mb-2" size="sm">
                {t("app.settings.integrations.audiomuse.serverUrlLabel")}
              </Heading>
              <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-4 py-2">
                <UrlInputField
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={() => handleFieldBlur(field)}
                  placeholder="192.168.1.10:8000"
                  placeholderTextColor={primary50}
                />
              </Input>
              <FieldError field={field} />
            </FormControl>
          )}
        </form.Field>

        <form.Field name="apiToken">
          {(field) => (
            <FormControl isInvalid={showFieldError(field)} className="mt-2">
              <Heading className="text-white font-normal mb-2" size="sm">
                {t("app.settings.integrations.audiomuse.apiTokenLabel")}
              </Heading>
              <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-4 py-2">
                <InputField
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={() => handleFieldBlur(field)}
                  className="text-md text-white"
                  placeholder={t(
                    "app.settings.integrations.audiomuse.apiTokenPlaceholder",
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
                {t("app.settings.integrations.audiomuse.testAndSaveAction")}
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
            <SettingsSectionTitle
              title={t("app.settings.integrations.audiomuse.features.title")}
            />
            <Text className="text-primary-100 text-sm">
              {t("app.settings.integrations.audiomuse.features.description")}
            </Text>
            <FeatureRow
              label={t(
                "app.settings.integrations.audiomuse.features.aiPlaylists",
              )}
              detail={
                effectiveAiProvider ??
                t("app.settings.integrations.audiomuse.features.noAiProvider")
              }
              hint={t(
                "app.settings.integrations.audiomuse.features.aiPlaylistsHint",
              )}
              available={!!effectiveAiProvider}
            />
            <FeatureRow
              label={t(
                "app.settings.integrations.audiomuse.features.soundSearch",
              )}
              detail={t(
                "app.settings.integrations.audiomuse.features.soundSearchDetail",
              )}
              hint={t(
                "app.settings.integrations.audiomuse.features.soundSearchHint",
              )}
              available={clapEnabled}
            />
            <FeatureRow
              label={t(
                "app.settings.integrations.audiomuse.features.lyricsSearch",
              )}
              detail={t(
                "app.settings.integrations.audiomuse.features.lyricsSearchDetail",
              )}
              hint={t(
                "app.settings.integrations.audiomuse.features.lyricsSearchHint",
              )}
              available={lyricsEnabled}
            />
            <FeatureRow
              label={t(
                "app.settings.integrations.audiomuse.features.fingerprint",
              )}
              detail={t(
                "app.settings.integrations.audiomuse.features.fingerprintDetail",
              )}
              hint={t(
                "app.settings.integrations.audiomuse.features.fingerprintHint",
              )}
              available={fingerprintEnabled}
            />
            {/* Served by the core IVF blueprint, so there is nothing to probe:
                what decides it is whether the analysis has anything in it. */}
            <FeatureRow
              label={t(
                "app.settings.integrations.audiomuse.features.similarTracks",
              )}
              detail={t(
                "app.settings.integrations.audiomuse.features.similarTracksDetail",
              )}
              hint={t(
                "app.settings.integrations.audiomuse.features.similarTracksHint",
              )}
              available={similarTracksAvailable}
            />
            {/* The same nearest-neighbour search seeded with a mood cluster or
                an anchor instead of a track, so it needs exactly what similar
                tracks needs. The moods themselves ship with the server. */}
            <FeatureRow
              label={t(
                "app.settings.integrations.audiomuse.features.moodPlaylists",
              )}
              detail={t(
                "app.settings.integrations.audiomuse.features.moodPlaylistsDetail",
              )}
              hint={t(
                "app.settings.integrations.audiomuse.features.moodPlaylistsHint",
              )}
              available={similarTracksAvailable}
            />
            {/* Its own blueprint, so this one *is* probeable — but only for
                whether the routes exist. A deployment that never built the
                artist index answers 503 at query time, which the artist screen
                shows as no row rather than an error. */}
            <FeatureRow
              label={t(
                "app.settings.integrations.audiomuse.features.similarArtists",
              )}
              detail={t(
                "app.settings.integrations.audiomuse.features.similarArtistsDetail",
              )}
              hint={t(
                "app.settings.integrations.audiomuse.features.similarArtistsHint",
              )}
              available={similarArtistsAvailable}
            />
            {/* Same core index as similar tracks, so it needs no probe either.
                The detail line reports the lyrics option separately: that one
                walks a second index the operator has to build. */}
            <FeatureRow
              label={t("app.settings.integrations.audiomuse.features.songPath")}
              detail={t(
                lyricsPathAvailable
                  ? "app.settings.integrations.audiomuse.features.songPathDetailLyrics"
                  : "app.settings.integrations.audiomuse.features.songPathDetail",
              )}
              hint={t(
                "app.settings.integrations.audiomuse.features.songPathHint",
              )}
              available={similarTracksAvailable}
            />
            {/* Not a capability but the precondition for all of them: a deployment
                that hasn't analyzed anything answers every search and prompt
                with nothing. Surfacing the count here is what makes that
                explicable rather than a silent empty screen. */}
            <FeatureRow
              label={t("app.settings.integrations.audiomuse.features.library")}
              detail={libraryDetail}
              available={(analyzedTrackCount ?? 0) > 0}
            />
            <SettingsActionRow
              label={t(
                "app.settings.integrations.audiomuse.features.refreshLabel",
              )}
              description={t(
                "app.settings.integrations.audiomuse.features.refreshDescription",
              )}
              actionLabel={t(
                "app.settings.integrations.audiomuse.features.refreshAction",
              )}
              onPress={handleRefreshFeatures}
              disabled={isRefreshing}
            />

            <Box className="h-px bg-primary-500 my-2" />
            <SettingsSelectRow
              label={t("app.settings.integrations.audiomuse.aiProvider.label")}
              description={t(
                "app.settings.integrations.audiomuse.aiProvider.description",
              )}
              badgeText={
                aiProviderOverride ??
                t("app.settings.integrations.audiomuse.aiProvider.autoOption")
              }
              onPress={() => aiProviderSheetRef.current?.present()}
            />

            {fingerprintEnabled && (
              <>
                <Box className="h-px bg-primary-500 my-2" />
                <SettingsSectionTitle
                  title={t(
                    "app.settings.integrations.audiomuse.fingerprint.title",
                  )}
                />
                <Text className="text-primary-100 text-sm">
                  {t(
                    "app.settings.integrations.audiomuse.fingerprint.description",
                  )}
                </Text>
                {fingerprintNeedsCredentials ? (
                  <>
                    <FormControl className="mt-2">
                      <Heading
                        className="text-white font-normal mb-2"
                        size="sm"
                      >
                        {t(
                          `app.settings.integrations.audiomuse.fingerprint.${fingerprintCredentialStyle}UserLabel`,
                        )}
                      </Heading>
                      <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 rounded-md px-4 py-2">
                        <InputField
                          value={fingerprintUserDraft}
                          onChangeText={setFingerprintUserDraft}
                          className="text-md text-white"
                          placeholder={t(
                            `app.settings.integrations.audiomuse.fingerprint.${fingerprintCredentialStyle}UserPlaceholder`,
                          )}
                          placeholderTextColor={primary50}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </Input>
                    </FormControl>
                    <FormControl className="mt-2">
                      <Heading
                        className="text-white font-normal mb-2"
                        size="sm"
                      >
                        {t(
                          `app.settings.integrations.audiomuse.fingerprint.${fingerprintCredentialStyle}SecretLabel`,
                        )}
                      </Heading>
                      <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 rounded-md px-4 py-2">
                        <InputField
                          value={fingerprintSecretDraft}
                          onChangeText={setFingerprintSecretDraft}
                          className="text-md text-white"
                          placeholder={t(
                            "app.settings.integrations.audiomuse.fingerprint.secretPlaceholder",
                          )}
                          placeholderTextColor={primary50}
                          autoCapitalize="none"
                          autoCorrect={false}
                          secureTextEntry
                        />
                      </Input>
                    </FormControl>
                    <HStack className="items-center justify-center mt-2">
                      <FadeOutScaleDown
                        onPress={handleSaveFingerprintCredentials}
                        disabled={!fingerprintUserDraft.trim()}
                        className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
                      >
                        <Text className="text-primary-800 font-bold text-lg">
                          {t("app.shared.save")}
                        </Text>
                      </FadeOutScaleDown>
                    </HStack>
                  </>
                ) : (
                  // Lyrion and Plex — and any deployment too old to name its
                  // server type — take no per-user account here, so there is
                  // nothing to fill in.
                  <Text className="text-primary-100 text-sm">
                    {t(
                      "app.settings.integrations.audiomuse.fingerprint.noCredentialsNote",
                    )}
                  </Text>
                )}
              </>
            )}

            {availableServers.length > 1 && (
              <>
                <Box className="h-px bg-primary-500 my-2" />
                <SettingsSelectRow
                  label={t("app.settings.integrations.audiomuse.server.label")}
                  description={t(
                    "app.settings.integrations.audiomuse.server.description",
                  )}
                  badgeText={selectedServerLabel}
                  onPress={() => serverSheetRef.current?.present()}
                />
              </>
            )}

            <Box className="h-px bg-primary-500 my-2" />
            <SettingsSelectRow
              label={t("app.settings.integrations.audiomuse.saveTarget.label")}
              description={t(
                "app.settings.integrations.audiomuse.saveTarget.description",
              )}
              badgeText={t(
                `app.settings.integrations.audiomuse.saveTarget.${saveTarget}`,
              )}
              onPress={() => saveTargetSheetRef.current?.present()}
            />
          </>
        )}
      </VStack>
    </SettingsScreenScaffold>
  );
}
