import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import { Box } from "@/components/ui/box";
import {
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
} from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Input, InputField } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea, TextareaInput } from "@/components/ui/textarea";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import {
  usePlaylist,
  useUpdatePlaylist,
} from "@/hooks/openSubsonic/usePlaylists";
import { artworkUrl } from "@/utils/artwork";
import { cn } from "@/utils/tailwind";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useForm, useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircleIcon, ListMusic, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import z from "zod";

const editPlaylistSchema = z.object({
  name: z.string().min(1),
  comment: z.string().optional(),
});

export default function EditPlaylistScreen() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error } = usePlaylist(id);
  const doUpdatePlaylist = useUpdatePlaylist();
  const form = useForm({
    defaultValues: {
      name: data?.playlist.name ?? "",
      comment: data?.playlist?.comment ?? "",
    },
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
                  <ToastDescription>
                    Playlist successfully updated
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
                  <ToastDescription>
                    An error occurred while updating the playlist
                  </ToastDescription>
                </Toast>
              ),
            });
          },
        },
      );
    },
  });

  const isDirty = useStore(form.store, (state) => state.isDirty);
  return (
    <Box className="h-full flex-1">
      <Box className="px-6 pb-6 bg-black">
        <HStack
          className="items-center justify-between"
          style={{ paddingTop: insets.top + 16 }}
        >
          <FadeOutScaleDown onPress={() => router.back()}>
            <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
              <X size={24} color={themeConfig.theme.colors.white} />
            </Box>
          </FadeOutScaleDown>
          <Heading className="text-white font-bold" size="lg">
            Edit playlist
          </Heading>
          <FadeOutScaleDown onPress={isDirty ? form.handleSubmit : undefined}>
            <Text
              className={cn("text-emerald-500 font-bold text-lg", {
                "opacity-50": !isDirty,
              })}
            >
              Save
            </Text>
          </FadeOutScaleDown>
        </HStack>
      </Box>
      <VStack
        className="px-6 mt-6"
        style={{ paddingBottom: bottomTabBarHeight + FLOATING_PLAYER_HEIGHT }}
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
              <ListMusic size={48} color={themeConfig.theme.colors.white} />
            </Box>
          )}
        </HStack>
        <form.Field name="name">
          {(field) => (
            <FormControl
              isInvalid={!field.state.meta.isValid}
              size="md"
              isDisabled={false}
              isReadOnly={false}
              isRequired={false}
              className="mb-2 mt-0"
            >
              <Input
                className="bg-primary-600 border-0 rounded-full"
                variant="rounded"
                size="xl"
              >
                <InputField
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={field.handleBlur}
                  className={cn(
                    "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-full",
                    {
                      "border-red-500": !field.state.meta.isValid,
                    },
                  )}
                  placeholder="Enter playlist name"
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
        <form.Field name="comment">
          {(field) => (
            <FormControl
              isInvalid={!field.state.meta.isValid}
              size="md"
              isDisabled={false}
              isReadOnly={false}
              isRequired={false}
              className="mb-2 mt-0"
            >
              <Textarea className="bg-primary-600 border-0 rounded-xl my-6 text-white">
                <TextareaInput
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={field.handleBlur}
                  className="text-md font-normal color-white"
                  placeholder="Describe your playlist"
                />
              </Textarea>
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
      </VStack>
    </Box>
  );
}
