import { useForm, useStore } from "@tanstack/react-form";
import type { Href } from "expo-router";
import ChevronRight from "lucide-react-native/dist/esm/icons/chevron-right.mjs";
import Compass from "lucide-react-native/dist/esm/icons/compass.mjs";
import ListChecks from "lucide-react-native/dist/esm/icons/list-checks.mjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import * as z from "zod";
import LidarrApiKeyHelpDialog from "@/components/downloaders/lidarr/LidarrApiKeyHelpDialog";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import UrlInputField from "@/components/forms/UrlInputField";
import { SettingsToggleRow } from "@/components/settings/SettingsRows";
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
import { useCanStartScan } from "@/hooks/useCanStartScan";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { testConnection } from "@/services/lidarr/auth";
import useLidarr from "@/stores/lidarr";
import { cn } from "@/utils/tailwind";

const lidarrConfigSchema = z.object({
  serverUrl: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
});

function LidarrLinkRow({
  icon,
  title,
  description,
  href,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: Href;
  disabled: boolean;
}) {
  const [gray200] = Uniwind.getCSSVariable(["--color-gray-200"]) as string[];
  return (
    <FadeOutScaleDown
      href={href}
      disabled={disabled}
      disabledOpacity={0.4}
      className={cn(disabled && "opacity-40")}
    >
      <HStack className="items-center gap-x-4 py-4">
        <Box className="w-8 items-center">{icon}</Box>
        <VStack className="gap-y-1 flex-1">
          <Heading className="text-white font-normal" size="md">
            {title}
          </Heading>
          <Text className="text-primary-100 text-sm">{description}</Text>
        </VStack>
        <ChevronRight size={20} color={gray200} />
      </HStack>
    </FadeOutScaleDown>
  );
}

export default function LidarrConfigScreen() {
  const { t } = useTranslation();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [white, primary50] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-primary-50",
  ]) as string[];

  const storedServerUrl = useLidarr((store) => store.serverUrl);
  const storedApiKey = useLidarr((store) => store.apiKey);
  const isConnected = useLidarr((store) => store.isConnected);
  const autoScanOnComplete = useLidarr((store) => store.autoScanOnComplete);
  const canStartScan = useCanStartScan();
  const setConfig = useLidarr((store) => store.setConfig);
  const setConnected = useLidarr((store) => store.setConnected);
  const setAutoScanOnComplete = useLidarr(
    (store) => store.setAutoScanOnComplete,
  );
  const clearConfig = useLidarr((store) => store.clearConfig);

  const [isTesting, setIsTesting] = useState(false);
  const [isApiKeyHelpOpen, setIsApiKeyHelpOpen] = useState(false);

  const form = useForm({
    defaultValues: {
      serverUrl: storedServerUrl,
      apiKey: storedApiKey,
    },
    validators: { onChange: lidarrConfigSchema },
    onSubmit: async ({ value }) => {
      const serverUrl = value.serverUrl.trim();
      const apiKey = value.apiKey.trim();
      setIsTesting(true);
      try {
        await testConnection({ serverUrl, apiKey });
      } catch {
        setConnected(false);
        showErrorToast(t("app.settings.downloaders.lidarr.connectionFailed"));
        return;
      } finally {
        setIsTesting(false);
      }
      setConfig({ serverUrl, apiKey });
      setConnected(true);
      // Mark the form pristine so the Remove button (gated on !isDirty) shows
      // immediately after a successful save.
      form.reset({ serverUrl, apiKey });
      showSuccessToast(t("app.settings.downloaders.lidarr.connectionSuccess"));
    },
  });

  const isDirty = useStore(form.store, (state) => state.isDirty);

  const handleRemove = () => {
    clearConfig();
    form.reset({ serverUrl: "", apiKey: "" });
    showSuccessToast(t("app.settings.downloaders.lidarr.removedMessage"));
  };

  return (
    <SettingsScreenScaffold title={t("app.settings.downloaders.lidarr.title")}>
      <VStack className="gap-y-4">
        <HStack className="items-center justify-between py-2">
          <Text className="text-primary-100 text-sm w-3/5">
            {t("app.settings.downloaders.lidarr.description")}
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
                ? t("app.settings.downloaders.statuses.active")
                : t("app.settings.downloaders.statuses.inactive")}
            </BadgeText>
          </Badge>
        </HStack>

        <FadeOutScaleDown
          onPress={() => setIsApiKeyHelpOpen(true)}
          className="self-start"
        >
          <Text className="text-emerald-400 text-sm underline">
            {t("app.settings.downloaders.lidarr.getApiKeyAction")}
          </Text>
        </FadeOutScaleDown>

        <form.Field name="serverUrl">
          {(field) => (
            <FormControl isInvalid={showFieldError(field)} className="mt-2">
              <Heading className="text-white font-normal mb-2" size="sm">
                {t("app.settings.downloaders.lidarr.serverUrlLabel")}
              </Heading>
              <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-4 py-2">
                <UrlInputField
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={() => handleFieldBlur(field)}
                  placeholder="192.168.1.10:8686"
                  placeholderTextColor={primary50}
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
                {t("app.settings.downloaders.lidarr.apiKeyLabel")}
              </Heading>
              <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-4 py-2">
                <InputField
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={() => handleFieldBlur(field)}
                  className="text-md text-white"
                  placeholder={t(
                    "app.settings.downloaders.lidarr.apiKeyPlaceholder",
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
                {t("app.settings.downloaders.lidarr.testAndSaveAction")}
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

        <Box className="h-px bg-primary-500 my-2" />

        <LidarrLinkRow
          icon={<Compass size={24} color={white} />}
          title={t("app.settings.downloaders.discovery.title")}
          description={t("app.settings.downloaders.discovery.description")}
          href="/downloaders/discovery"
          disabled={!isConnected}
        />
        <LidarrLinkRow
          icon={<ListChecks size={24} color={white} />}
          title={t("app.settings.downloaders.downloads.title")}
          description={t("app.settings.downloaders.downloads.description")}
          href="/downloaders/downloads"
          disabled={!isConnected}
        />

        <Box className="h-px bg-primary-500 my-2" />
        <SettingsToggleRow
          label={t("app.settings.downloaders.lidarr.autoScanLabel")}
          description={t("app.settings.downloaders.lidarr.autoScanDescription")}
          value={autoScanOnComplete}
          onToggle={setAutoScanOnComplete}
          disabled={!canStartScan}
        />
      </VStack>
      <LidarrApiKeyHelpDialog
        isOpen={isApiKeyHelpOpen}
        onClose={() => setIsApiKeyHelpOpen(false)}
      />
    </SettingsScreenScaffold>
  );
}
