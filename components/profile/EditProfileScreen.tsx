import { useForm, useStore } from "@tanstack/react-form";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import EyeIcon from "lucide-react-native/dist/esm/icons/eye.mjs";
import EyeOffIcon from "lucide-react-native/dist/esm/icons/eye-off.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import * as z from "zod";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import { Box } from "@/components/ui/box";
import { Divider } from "@/components/ui/divider";
import { FormControl } from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputSlot } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import {
  useChangePassword,
  useGetUser,
  useUpdateUser,
} from "@/hooks/backend/useUsers";
import {
  useGetUser as useGetNavidromeUser,
  useUpdateUser as useUpdateNavidromeUser,
} from "@/hooks/navidrome/useUsers";
import useAuth from "@/stores/auth";
import { cn } from "@/utils/tailwind";

const ROLE_FIELDS = [
  "adminRole",
  "settingsRole",
  "streamRole",
  "jukeboxRole",
  "downloadRole",
  "uploadRole",
  "playlistRole",
  "coverArtRole",
  "commentRole",
  "podcastRole",
  "shareRole",
  "videoConversionRole",
  "scrobblingEnabled",
] as const;

type RoleField = (typeof ROLE_FIELDS)[number];

const ROLE_I18N_KEYS: Record<RoleField, string> = {
  adminRole: "admin",
  settingsRole: "settings",
  streamRole: "stream",
  jukeboxRole: "jukebox",
  downloadRole: "download",
  uploadRole: "upload",
  playlistRole: "playlist",
  coverArtRole: "coverArt",
  commentRole: "comment",
  podcastRole: "podcast",
  shareRole: "share",
  videoConversionRole: "videoConversion",
  scrobblingEnabled: "scrobbling",
};

const editProfileSchema = z
  .object({
    email: z.string().trim().email().optional().or(z.literal("")),
    password: z.string().optional().or(z.literal("")),
    passwordConfirm: z.string().optional().or(z.literal("")),
    currentPassword: z.string().optional().or(z.literal("")),
    maxBitRate: z.string().optional(),
    musicFolderId: z.string().optional(),
    adminRole: z.boolean().optional(),
    settingsRole: z.boolean().optional(),
    streamRole: z.boolean().optional(),
    jukeboxRole: z.boolean().optional(),
    downloadRole: z.boolean().optional(),
    uploadRole: z.boolean().optional(),
    playlistRole: z.boolean().optional(),
    coverArtRole: z.boolean().optional(),
    commentRole: z.boolean().optional(),
    podcastRole: z.boolean().optional(),
    shareRole: z.boolean().optional(),
    videoConversionRole: z.boolean().optional(),
    scrobblingEnabled: z.boolean().optional(),
  })
  .refine(
    (data) =>
      !data.password || data.password.length === 0
        ? true
        : data.password === data.passwordConfirm,
    {
      path: ["passwordConfirm"],
      message: "passwordMismatch",
    },
  );

type EditProfileValues = z.input<typeof editProfileSchema>;

function parseFolderIds(input?: string): number[] | undefined {
  if (!input) return undefined;
  const ids = input
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => Number.isFinite(n));
  return ids.length > 0 ? ids : undefined;
}

export default function EditProfileScreen() {
  const [white, gray600, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-600",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { username } = useLocalSearchParams<{ username: string }>();
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const currentUsername = useAuth((store) => store.username);
  const hasNavidromeNative = useAuth((store) => store.hasNavidromeNative);
  const serverType = useAuth((store) => store.serverType);
  const isJellyfin = serverType === "jellyfin";
  const navidromeUserId = useAuth((store) => store.userId);
  const setStoredPassword = useAuth((store) => store.setPassword);
  const { data: subsonicData } = useGetUser(
    hasNavidromeNative ? "" : currentUsername,
  );
  const { data: navidromeUser } = useGetNavidromeUser(
    hasNavidromeNative ? navidromeUserId : null,
  );
  const doUpdateUser = useUpdateUser();
  const doChangePassword = useChangePassword();
  const doUpdateNavidromeUser = useUpdateNavidromeUser();
  const subsonicUser = subsonicData?.user;
  const user = hasNavidromeNative
    ? navidromeUser
      ? {
          email: navidromeUser.email,
          adminRole: navidromeUser.isAdmin,
          maxBitRate: undefined as number | undefined,
          folder: undefined as number[] | undefined,
          settingsRole: false,
          streamRole: false,
          jukeboxRole: false,
          downloadRole: false,
          uploadRole: false,
          playlistRole: false,
          coverArtRole: false,
          commentRole: false,
          podcastRole: false,
          shareRole: false,
          videoConversionRole: false,
          scrobblingEnabled: false,
        }
      : undefined
    : subsonicUser;

  const form = useForm({
    defaultValues: {
      email: user?.email ?? "",
      password: "",
      passwordConfirm: "",
      currentPassword: "",
      maxBitRate: user?.maxBitRate !== undefined ? String(user.maxBitRate) : "",
      musicFolderId: user?.folder?.join(",") ?? "",
      adminRole: user?.adminRole ?? false,
      settingsRole: user?.settingsRole ?? false,
      streamRole: user?.streamRole ?? false,
      jukeboxRole: user?.jukeboxRole ?? false,
      downloadRole: user?.downloadRole ?? false,
      uploadRole: user?.uploadRole ?? false,
      playlistRole: user?.playlistRole ?? false,
      coverArtRole: user?.coverArtRole ?? false,
      commentRole: user?.commentRole ?? false,
      podcastRole: user?.podcastRole ?? false,
      shareRole: user?.shareRole ?? false,
      videoConversionRole: user?.videoConversionRole ?? false,
      scrobblingEnabled: user?.scrobblingEnabled ?? false,
    } as EditProfileValues,
    validators: {
      onChange: editProfileSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        if (isJellyfin) {
          if (value.password && value.password.length > 0) {
            await doChangePassword.mutateAsync({
              username: currentUsername,
              password: value.password,
              currentPassword: value.currentPassword || undefined,
            });
            if (currentUsername === username) {
              setStoredPassword(value.password);
            }
          }
        } else if (hasNavidromeNative) {
          if (!navidromeUserId || !navidromeUser) {
            throw new Error("Missing Navidrome user id");
          }
          const changingPassword =
            !!value.password && value.password.length > 0;
          await doUpdateNavidromeUser.mutateAsync({
            id: navidromeUserId,
            body: {
              userName: navidromeUser.userName,
              name: navidromeUser.name,
              email: value.email ?? "",
              isAdmin: user?.adminRole
                ? !!value.adminRole
                : navidromeUser.isAdmin,
              ...(changingPassword ? { password: value.password } : {}),
              ...(changingPassword && value.currentPassword
                ? { currentPassword: value.currentPassword }
                : {}),
            },
          });
          if (changingPassword && currentUsername === navidromeUser.userName) {
            setStoredPassword(value.password as string);
          }
        } else {
          if (value.password && value.password.length > 0) {
            await doChangePassword.mutateAsync({
              username: currentUsername,
              password: value.password,
            });
            if (currentUsername === username) {
              setStoredPassword(value.password);
            }
          }
          const maxBitRate =
            value.maxBitRate && value.maxBitRate.length > 0
              ? Number.parseInt(value.maxBitRate, 10)
              : undefined;
          await doUpdateUser.mutateAsync({
            username: currentUsername,
            email: value.email || undefined,
            maxBitRate: Number.isFinite(maxBitRate as number)
              ? (maxBitRate as number)
              : undefined,
            musicFolderId: parseFolderIds(value.musicFolderId),
            ...(user?.adminRole
              ? {
                  adminRole: value.adminRole,
                  settingsRole: value.settingsRole,
                  streamRole: value.streamRole,
                  jukeboxRole: value.jukeboxRole,
                  downloadRole: value.downloadRole,
                  uploadRole: value.uploadRole,
                  playlistRole: value.playlistRole,
                  coverArtRole: value.coverArtRole,
                  commentRole: value.commentRole,
                  podcastRole: value.podcastRole,
                  shareRole: value.shareRole,
                  videoConversionRole: value.videoConversionRole,
                  scrobblingEnabled: value.scrobblingEnabled,
                }
              : {}),
          });
        }
        toast.show({
          placement: "top",
          duration: 3000,
          render: () => (
            <Toast action="success">
              <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
              <ToastDescription>
                {t("app.editProfile.successMessage")}
              </ToastDescription>
            </Toast>
          ),
        });
        router.back();
      } catch (error) {
        console.error(error);
        toast.show({
          placement: "top",
          duration: 3000,
          render: () => (
            <Toast action="error">
              <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
              <ToastDescription>
                {t("app.editProfile.errorMessage")}
              </ToastDescription>
            </Toast>
          ),
        });
      }
    },
  });

  const isDirty = useStore(form.store, (state) => state.isDirty);

  return (
    <Box className="h-full flex-1 bg-black">
      <Box className="px-6 pb-6 bg-black">
        <HStack
          className="items-center"
          style={{ paddingTop: insets.top + 16 }}
        >
          <Box className="flex-1 items-start">
            <FadeOutScaleDown onPress={() => router.back()}>
              <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                <X size={24} color={white} />
              </Box>
            </FadeOutScaleDown>
          </Box>
          <Heading
            className="text-white font-bold text-center px-2"
            size="lg"
            numberOfLines={1}
          >
            {t("app.editProfile.title")}
          </Heading>
          <Box className="flex-1 items-end">
            <FadeOutScaleDown onPress={isDirty ? form.handleSubmit : undefined}>
              <Text
                className={cn("text-emerald-500 font-bold text-lg", {
                  "opacity-50": !isDirty,
                })}
              >
                {t("app.shared.save")}
              </Text>
            </FadeOutScaleDown>
          </Box>
        </HStack>
      </Box>
      <KeyboardAwareScrollView
        bottomOffset={60}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 8,
          paddingBottom:
            insets.bottom + tabBarHeight + FLOATING_PLAYER_HEIGHT + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Heading size="md" className="text-white mb-3">
          {t("app.editProfile.infoSection")}
        </Heading>
        <VStack className="mb-2">
          <Text className="text-primary-100 text-sm mb-1">
            {t("app.editProfile.usernameLabel")}
          </Text>
          <Text className="text-white font-bold mb-3">{username}</Text>
        </VStack>
        {!isJellyfin && (
          <form.Field name="email">
            {(field) => (
              <FormControl
                isInvalid={showFieldError(field)}
                size="md"
                className="mb-4"
              >
                <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                  <InputField
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={() => handleFieldBlur(field)}
                    className="text-md text-white"
                    placeholder={t("app.editProfile.emailPlaceholder")}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </Input>
                <FieldError field={field} />
              </FormControl>
            )}
          </form.Field>
        )}

        <Divider className="my-4 bg-primary-600" />

        <Heading size="md" className="text-white mb-3">
          {t("app.editProfile.passwordSection")}
        </Heading>
        {(hasNavidromeNative || isJellyfin) && (
          <form.Field name="currentPassword">
            {(field) => (
              <FormControl
                isInvalid={showFieldError(field)}
                size="md"
                className="mb-2"
              >
                <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                  <InputField
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={() => handleFieldBlur(field)}
                    className="text-md text-white"
                    placeholder={t(
                      "app.editProfile.currentPasswordPlaceholder",
                    )}
                    secureTextEntry={!showCurrentPassword}
                    autoCapitalize="none"
                  />
                  <InputSlot>
                    <Pressable
                      onPress={() => setShowCurrentPassword((v) => !v)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        showCurrentPassword
                          ? t("auth.login.hidePassword")
                          : t("auth.login.showPassword")
                      }
                    >
                      {showCurrentPassword ? (
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
        )}
        <form.Field name="password">
          {(field) => (
            <FormControl
              isInvalid={showFieldError(field)}
              size="md"
              className="mb-2"
            >
              <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                <InputField
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={() => handleFieldBlur(field)}
                  className="text-md text-white"
                  placeholder={t("app.editProfile.newPasswordPlaceholder")}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
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
        <form.Field name="passwordConfirm">
          {(field) => (
            <FormControl
              isInvalid={showFieldError(field)}
              size="md"
              className="mb-4"
            >
              <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                <InputField
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={() => handleFieldBlur(field)}
                  className="text-md text-white"
                  placeholder={t("app.editProfile.confirmPasswordPlaceholder")}
                  secureTextEntry={!showPasswordConfirm}
                  autoCapitalize="none"
                />
                <InputSlot>
                  <Pressable
                    onPress={() => setShowPasswordConfirm((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPasswordConfirm
                        ? t("auth.login.hidePassword")
                        : t("auth.login.showPassword")
                    }
                  >
                    {showPasswordConfirm ? (
                      <EyeOffIcon size={20} color={white} />
                    ) : (
                      <EyeIcon size={20} color={white} />
                    )}
                  </Pressable>
                </InputSlot>
              </Input>
              {showFieldError(field) && (
                <Text className="text-red-500 text-sm mt-1">
                  {t("app.editProfile.passwordMismatch")}
                </Text>
              )}
            </FormControl>
          )}
        </form.Field>

        {!hasNavidromeNative && !isJellyfin && (
          <>
            <Divider className="my-4 bg-primary-600" />

            <Heading size="md" className="text-white mb-3">
              {t("app.editProfile.streamingSection")}
            </Heading>
            <form.Field name="maxBitRate">
              {(field) => (
                <FormControl size="md" className="mb-2">
                  <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={() => handleFieldBlur(field)}
                      className="text-md text-white"
                      placeholder={t("app.editProfile.maxBitRatePlaceholder")}
                      keyboardType="number-pad"
                    />
                  </Input>
                </FormControl>
              )}
            </form.Field>
            <form.Field name="musicFolderId">
              {(field) => (
                <FormControl size="md" className="mb-4">
                  <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={() => handleFieldBlur(field)}
                      className="text-md text-white"
                      placeholder={t(
                        "app.editProfile.musicFolderIdPlaceholder",
                      )}
                      autoCapitalize="none"
                    />
                  </Input>
                </FormControl>
              )}
            </form.Field>
          </>
        )}

        {!hasNavidromeNative && !isJellyfin && user?.adminRole && (
          <>
            <Divider className="my-4 bg-primary-600" />

            <Heading size="md" className="text-white mb-3">
              {t("app.editProfile.rolesSection")}
            </Heading>
            <VStack className="gap-y-3">
              {ROLE_FIELDS.map((roleField) => (
                <form.Field key={roleField} name={roleField}>
                  {(field) => (
                    <HStack className="items-start justify-between gap-x-4">
                      <VStack className="flex-1">
                        <Text className="text-white shrink pr-4">
                          {t(
                            `app.editProfile.roleLabels.${ROLE_I18N_KEYS[roleField]}`,
                          )}
                        </Text>
                        <Text className="text-primary-100 text-sm flex-1 truncate">
                          {t(
                            `app.editProfile.roleDescriptions.${ROLE_I18N_KEYS[roleField]}`,
                          )}
                        </Text>
                      </VStack>
                      <Switch
                        value={Boolean(field.state.value)}
                        onValueChange={field.handleChange}
                        trackColor={{ false: gray600, true: emerald500 }}
                        thumbColor={white}
                      />
                    </HStack>
                  )}
                </form.Field>
              ))}
            </VStack>
          </>
        )}
      </KeyboardAwareScrollView>
    </Box>
  );
}
