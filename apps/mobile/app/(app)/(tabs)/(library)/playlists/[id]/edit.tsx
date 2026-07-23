import { useForm, useSelector } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useTranslation } from "react-i18next";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import * as z from "zod";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import { Box } from "@/components/ui/box";
import { FormControl } from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Input, InputField } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { Textarea, TextareaInput } from "@/components/ui/textarea";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { usePlaylist, useUpdatePlaylist } from "@/hooks/backend/usePlaylists";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import useApp from "@/stores/app";
import { artworkUrl } from "@/utils/artwork";
import { logError } from "@/utils/log";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

const editPlaylistSchema = z.object({
  name: z.string().min(1).trim(),
  comment: z.string().trim().optional(),
  isPublic: z.boolean(),
});

export default function EditPlaylistScreen() {
  const [white, gray600, gray400, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-600",
    "--color-gray-400",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const screenBottomPadding = useScreenBottomPadding();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error } = usePlaylist(id);
  const doUpdatePlaylist = useUpdatePlaylist();
  const capabilities = useCapabilities();
  const form = useForm({
    defaultValues: {
      name: data?.playlist.name ?? "",
      comment: data?.playlist?.comment ?? "",
      isPublic: data?.playlist?.public ?? false,
    } as z.input<typeof editPlaylistSchema>,
    validators: {
      onChange: editPlaylistSchema,
    },
    onSubmit: async ({ value }) => {
      doUpdatePlaylist.mutate(
        { id, ...value },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["playlist", id] });
            router.navigate(`/playlists/${id}`);
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="success">
                  <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                  <ToastDescription>
                    {t("app.editPlaylist.editPlaylistSuccessMessage")}
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
                    {t("app.editPlaylist.editPlaylistErrorMessage")}
                  </ToastDescription>
                </Toast>
              ),
            });
          },
        },
      );
    },
  });

  const isDirty = useSelector(form.store, (state) => state.isDirty);
  return (
    <Box className="h-full flex-1">
      <Box className="px-6 pb-6 bg-black">
        <HStack
          className="items-center"
          style={{ paddingTop: insets.top + (isWideLayout ? 0 : 16) }}
        >
          <Box className="flex-1 items-start">
            <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
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
            {t("app.editPlaylist.title")}
          </Heading>
          <Box className="flex-1 items-end">
            <FadeOutScaleDown
              onPress={form.handleSubmit}
              disabled={!isDirty || doUpdatePlaylist.isPending}
            >
              {doUpdatePlaylist.isPending ? (
                <Spinner color={emerald500} />
              ) : (
                <Text
                  className={cn("text-emerald-500 font-bold text-lg", {
                    "opacity-50": !isDirty,
                  })}
                >
                  {t("app.shared.save")}
                </Text>
              )}
            </FadeOutScaleDown>
          </Box>
        </HStack>
      </Box>
      {error && <ErrorDisplay error={error as Error} />}
      {!error && isLoading && !data && (
        <Box className="flex-1 items-center justify-center">
          <Spinner />
        </Box>
      )}
      {!error && (!isLoading || data) && (
        <KeyboardAwareScrollView
          bottomOffset={60}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: screenBottomPadding + (isWideLayout ? 48 : 0),
          }}
          showsVerticalScrollIndicator={false}
        >
          <HStack className="items-center justify-center mb-6">
            {data?.playlist?.coverArt ? (
              <Image
                source={{ uri: artworkUrl(data?.playlist?.coverArt) }}
                className="w-[50%] aspect-square rounded-md"
                alt="Playlist cover"
              />
            ) : (
              <Box className="w-[50%] aspect-square rounded-md bg-primary-600 items-center justify-center">
                <ListMusic size={48} color={white} />
              </Box>
            )}
          </HStack>
          <form.Field name="name">
            {(field) => (
              <FormControl
                isInvalid={showFieldError(field)}
                size="md"
                isDisabled={false}
                isReadOnly={false}
                isRequired={false}
                className="mb-4 mt-0"
              >
                <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                  <InputField
                    disableFullscreenUI
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={() => handleFieldBlur(field)}
                    className="text-md text-white"
                    placeholder={t("app.editPlaylist.namePlaceholder")}
                    placeholderTextColor={gray400}
                  />
                </Input>
                <FieldError field={field} />
              </FormControl>
            )}
          </form.Field>
          {capabilities.playlistDescription && (
            <form.Field name="comment">
              {(field) => (
                <FormControl
                  isInvalid={showFieldError(field)}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="mb-4 mt-0"
                >
                  <Textarea className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                    <TextareaInput
                      disableFullscreenUI
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={() => handleFieldBlur(field)}
                      className="text-md font-normal text-white"
                      placeholder={t("app.editPlaylist.descriptionPlaceholder")}
                      placeholderTextColor={gray400}
                    />
                  </Textarea>
                  <FieldError field={field} />
                </FormControl>
              )}
            </form.Field>
          )}
          <form.Field name="isPublic">
            {(field) => (
              <HStack className="items-center justify-between">
                <VStack className="shrink pr-4">
                  <Text className="text-white font-bold">
                    {t("app.editPlaylist.publicLabel")}
                  </Text>
                  <Text className="text-primary-100 text-sm">
                    {t("app.editPlaylist.publicDescription")}
                  </Text>
                </VStack>
                <Switch
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  trackColor={{
                    false: gray600,
                    true: emerald500,
                  }}
                  thumbColor={white}
                />
              </HStack>
            )}
          </form.Field>
        </KeyboardAwareScrollView>
      )}
    </Box>
  );
}
