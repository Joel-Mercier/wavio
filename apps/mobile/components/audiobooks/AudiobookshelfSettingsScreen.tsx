import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useForm, useSelector } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import EyeIcon from "lucide-react-native/icons/eye";
import EyeOffIcon from "lucide-react-native/icons/eye-off";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import * as z from "zod";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import UrlInputField from "@/components/forms/UrlInputField";
import SelectBottomSheet from "@/components/SelectBottomSheet";
import SelectFieldRow from "@/components/SelectFieldRow";
import ConfirmActionDialog from "@/components/settings/ConfirmActionDialog";
import SettingsNotice from "@/components/settings/SettingsNotice";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { FormControl } from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputSlot } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { endAudiobookPlayback } from "@/services/audiobookPlayback";
import {
  AudiobookshelfInvalidCredentialsError,
  AudiobookshelfUnreachableError,
  AudiobookshelfUnsupportedVersionError,
  bookLibraries,
  getLibraries,
  signIn,
  signOut,
} from "@/services/audiobookshelf/auth";
import useAudiobookshelf from "@/stores/audiobookshelf";
import { cn } from "@/utils/tailwind";

const schema = z.object({
  serverUrl: z.string().trim().min(1),
  username: z.string().trim().min(1),
  password: z.string(),
});

export default function AudiobookshelfSettingsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [primary50, white] = Uniwind.getCSSVariable([
    "--color-primary-50",
    "--color-white",
  ]) as string[];
  const storedServerUrl = useAudiobookshelf((s) => s.serverUrl);
  const storedUsername = useAudiobookshelf((s) => s.username);
  const isConnected = useAudiobookshelf((s) => s.isConnected);
  const serverVersion = useAudiobookshelf((s) => s.serverVersion);
  const libraries = useAudiobookshelf((s) => s.libraries);
  const libraryId = useAudiobookshelf((s) => s.libraryId);
  const setSession = useAudiobookshelf((s) => s.setSession);
  const setLibraries = useAudiobookshelf((s) => s.setLibraries);
  const setLibraryId = useAudiobookshelf((s) => s.setLibraryId);
  const clearConfig = useAudiobookshelf((s) => s.clearConfig);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const librarySheetRef = useRef<BottomSheetModal>(null);
  const sessionExpired = !isConnected && !!storedServerUrl;

  const resetCachedData = () => {
    void queryClient.resetQueries({ queryKey: ["abs"] });
  };

  const form = useForm({
    defaultValues: {
      serverUrl: storedServerUrl,
      username: storedUsername,
      password: "",
    },
    validators: { onChange: schema },
    onSubmit: async ({ value }) => {
      setIsSigningIn(true);
      try {
        const result = await signIn(value);
        const { accessToken = "", refreshToken = "" } = result.user;
        const found = bookLibraries(
          await getLibraries({ serverUrl: result.serverUrl, accessToken }),
        );
        if (found.length === 0) {
          showErrorToast(
            t("app.settings.integrations.audiobookshelf.noLibraries"),
          );
          return;
        }
        setSession({
          serverUrl: result.serverUrl,
          username: result.user.username,
          userId: result.user.id,
          accessToken,
          refreshToken,
          serverVersion: result.serverVersion,
          canDownload: result.user.permissions.download,
          canDelete: result.user.permissions.delete,
        });
        setLibraries(found);
        if (
          result.defaultLibraryId &&
          found.some((library) => library.id === result.defaultLibraryId)
        ) {
          setLibraryId(result.defaultLibraryId);
        }
        resetCachedData();
        form.reset({
          serverUrl: result.serverUrl,
          username: result.user.username,
          password: "",
        });
        showSuccessToast(
          t("app.settings.integrations.audiobookshelf.connectionSuccess"),
        );
      } catch (error) {
        showErrorToast(
          error instanceof AudiobookshelfInvalidCredentialsError
            ? t("app.settings.integrations.audiobookshelf.invalidCredentials")
            : error instanceof AudiobookshelfUnsupportedVersionError
              ? t(
                  "app.settings.integrations.audiobookshelf.unsupportedVersion",
                  {
                    version: error.version,
                  },
                )
              : error instanceof AudiobookshelfUnreachableError
                ? t("app.settings.integrations.audiobookshelf.unreachable")
                : t(
                    "app.settings.integrations.audiobookshelf.connectionFailed",
                  ),
        );
      } finally {
        setIsSigningIn(false);
      }
    },
  });

  const isDirty = useSelector(form.store, (state) => state.isDirty);

  const handleRemove = async () => {
    setConfirmRemove(false);
    endAudiobookPlayback();
    await signOut();
    clearConfig();
    resetCachedData();
    form.reset({ serverUrl: "", username: "", password: "" });
    showSuccessToast(
      t("app.settings.integrations.audiobookshelf.removedMessage"),
    );
  };

  const library = libraries.find((l) => l.id === libraryId);

  return (
    <SettingsScreenScaffold
      title={t("app.settings.integrations.audiobookshelf.title")}
    >
      <VStack className="gap-y-4">
        <HStack className="items-center justify-between py-2">
          <Text className="text-primary-100 text-sm w-3/5">
            {t("app.settings.integrations.audiobookshelf.longDescription")}
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

        {sessionExpired && (
          <SettingsNotice
            message={t(
              "app.settings.integrations.audiobookshelf.sessionExpired",
            )}
          />
        )}

        <form.Field name="serverUrl">
          {(field) => (
            <FormControl isInvalid={showFieldError(field)} className="mt-2">
              <Heading className="text-white font-normal mb-2" size="sm">
                {t("app.settings.integrations.audiobookshelf.serverUrlLabel")}
              </Heading>
              <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-4 py-2">
                <UrlInputField
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={() => handleFieldBlur(field)}
                  placeholder="192.168.1.10:13378"
                  placeholderTextColor={primary50}
                />
              </Input>
              <FieldError field={field} />
            </FormControl>
          )}
        </form.Field>

        <form.Field name="username">
          {(field) => (
            <FormControl isInvalid={showFieldError(field)}>
              <Heading className="text-white font-normal mb-2" size="sm">
                {t("app.settings.integrations.audiobookshelf.usernameLabel")}
              </Heading>
              <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-4 py-2">
                <InputField
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={() => handleFieldBlur(field)}
                  className="text-md text-white"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                />
              </Input>
              <FieldError field={field} />
            </FormControl>
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <FormControl isInvalid={showFieldError(field)}>
              <Heading className="text-white font-normal mb-2" size="sm">
                {t("app.settings.integrations.audiobookshelf.passwordLabel")}
              </Heading>
              <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-4 py-2">
                <InputField
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={() => handleFieldBlur(field)}
                  className="text-md text-white"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  secureTextEntry={!showPassword}
                />
                <InputSlot>
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword
                        ? t("auth.login.hidePassword")
                        : t("auth.login.showPassword")
                    }
                  >
                    {showPassword ? (
                      <EyeOffIcon size={20} color={white} />
                    ) : (
                      <EyeIcon size={20} color={white} />
                    )}
                  </Pressable>
                </InputSlot>
              </Input>
              <FieldError field={field} />
            </FormControl>
          )}
        </form.Field>

        <HStack className="items-center justify-center gap-x-4 mt-2">
          <FadeOutScaleDown
            disabled={isSigningIn}
            onPress={() => {
              if (!isSigningIn) form.handleSubmit();
            }}
            className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
          >
            {isSigningIn ? (
              <Spinner color="rgb(41, 41, 41)" />
            ) : (
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.settings.integrations.audiobookshelf.signInAction")}
              </Text>
            )}
          </FadeOutScaleDown>
          {!!storedServerUrl && !isDirty && (
            <FadeOutScaleDown
              onPress={() => setConfirmRemove(true)}
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
            {libraries.length > 1 && (
              <SelectFieldRow
                label={t(
                  "app.settings.integrations.audiobookshelf.libraryLabel",
                )}
                value={library?.name}
                placeholder={t(
                  "app.settings.integrations.audiobookshelf.libraryLabel",
                )}
                onPress={() => librarySheetRef.current?.present()}
              />
            )}
            {!!serverVersion && (
              <Text className="text-primary-100 text-sm">
                {t("app.settings.integrations.audiobookshelf.serverVersion", {
                  version: serverVersion,
                })}
              </Text>
            )}
          </>
        )}
      </VStack>
      <SelectBottomSheet
        sheetRef={librarySheetRef}
        title={t("app.settings.integrations.audiobookshelf.libraryLabel")}
        options={libraries.map((l) => ({ label: l.name, value: l.id }))}
        selectedValues={libraryId ? [libraryId] : []}
        onSelect={setLibraryId}
      />
      <ConfirmActionDialog
        isOpen={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={t("app.settings.integrations.audiobookshelf.removeTitle")}
        description={t(
          "app.settings.integrations.audiobookshelf.removeDescription",
        )}
        confirmLabel={t("app.shared.delete")}
        cancelLabel={t("app.shared.cancel")}
        confirmVariant="danger"
        onConfirm={() => void handleRemove()}
      />
    </SettingsScreenScaffold>
  );
}
