import { useForm } from "@tanstack/react-form";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useState } from "react";
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
import RuleEditor from "@/components/smartPlaylist/RuleEditor";
import { Box } from "@/components/ui/box";
import { FormControl } from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
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
import { useCreateSmartPlaylist } from "@/hooks/navidrome/useSmartPlaylists";
import useAuth from "@/stores/auth";
import { logError } from "@/utils/log";
import { goBackOrHome } from "@/utils/navigation";
import {
  defaultRule,
  type FormRule,
  type FormSortEntry,
  toNavidromeCriteria,
} from "@/utils/smartPlaylist";

const metadataSchema = z.object({
  name: z.string().trim().min(1),
  comment: z.string(),
  isPublic: z.boolean(),
});

export default function NewSmartPlaylistScreen() {
  const [white, gray400, gray600, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-400",
    "--color-gray-600",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const serverVersion = useAuth((s) => s.serverVersion);
  const doCreate = useCreateSmartPlaylist();

  const [combinator, setCombinator] = useState<"all" | "any">("all");
  const [rules, setRules] = useState<FormRule[]>([defaultRule()]);
  const [sorts, setSorts] = useState<FormSortEntry[]>([]);
  const [limit, setLimit] = useState<string>("");

  const form = useForm({
    defaultValues: { name: "", comment: "", isPublic: false },
    validators: { onChange: metadataSchema },
    onSubmit: async ({ value }) => {
      if (rules.length === 0) {
        toast.show({
          placement: "top",
          duration: 3000,
          render: () => (
            <Toast action="error">
              <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
              <ToastDescription>
                {t("app.smartPlaylist.atLeastOneRule")}
              </ToastDescription>
            </Toast>
          ),
        });
        return;
      }
      const criteria = toNavidromeCriteria(
        {
          name: value.name,
          comment: value.comment,
          isPublic: value.isPublic,
          combinator,
          rules,
          sorts,
          limit,
        },
        serverVersion,
      );
      doCreate.mutate(
        {
          name: value.name,
          comment: value.comment || undefined,
          public: value.isPublic,
          rules: criteria,
        },
        {
          onSuccess: () => {
            goBackOrHome(router);
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="success">
                  <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                  <ToastDescription>
                    {t("app.newSmartPlaylist.successMessage")}
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
                    {t("app.newSmartPlaylist.errorMessage")}
                  </ToastDescription>
                </Toast>
              ),
            });
          },
        },
      );
    },
  });

  return (
    <Box className="h-full flex-1 bg-black">
      <Box className="px-6 pb-4 bg-black">
        <HStack
          className="items-center"
          style={{ paddingTop: insets.top + 16 }}
        >
          <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
            <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
              <X size={24} color={white} />
            </Box>
          </FadeOutScaleDown>
          <Heading
            className="text-white font-bold text-center truncate flex-1"
            size="lg"
            numberOfLines={1}
          >
            {t("app.newSmartPlaylist.title")}
          </Heading>
          <Box className="w-10" />
        </HStack>
      </Box>
      <KeyboardAwareScrollView
        bottomOffset={60}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 24,
          paddingTop: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <VStack className="gap-y-4">
          <form.Field name="name">
            {(field) => (
              <FormControl
                isInvalid={showFieldError(field)}
                size="md"
                className="mb-0"
              >
                <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-4 py-2">
                  <InputField
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={() => handleFieldBlur(field)}
                    className="text-md text-white"
                    placeholder={t("app.newSmartPlaylist.namePlaceholder")}
                    placeholderTextColor={gray400}
                  />
                </Input>
                <FieldError field={field} />
              </FormControl>
            )}
          </form.Field>
          <form.Field name="comment">
            {(field) => (
              <FormControl size="md">
                <Textarea className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 rounded-md px-4 py-2">
                  <TextareaInput
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    className="text-md font-normal text-white"
                    placeholder={t("app.newSmartPlaylist.commentPlaceholder")}
                    placeholderTextColor={gray400}
                  />
                </Textarea>
              </FormControl>
            )}
          </form.Field>
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
                  trackColor={{ false: gray600, true: emerald500 }}
                  thumbColor={white}
                />
              </HStack>
            )}
          </form.Field>

          <Box className="h-px bg-primary-600 my-2" />

          <RuleEditor
            combinator={combinator}
            onCombinatorChange={setCombinator}
            rules={rules}
            onRulesChange={setRules}
            sorts={sorts}
            onSortsChange={setSorts}
            limit={limit}
            onLimitChange={setLimit}
            serverVersion={serverVersion}
          />
        </VStack>
      </KeyboardAwareScrollView>
      <LinearGradient
        colors={["transparent", "#000000"]}
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: insets.bottom + 16,
          paddingTop: 48,
          alignItems: "center",
        }}
      >
        <FadeOutScaleDown
          onPress={form.handleSubmit}
          className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
        >
          <Text className="text-primary-800 font-bold text-lg">
            {t("app.shared.create")}
          </Text>
        </FadeOutScaleDown>
      </LinearGradient>
    </Box>
  );
}
