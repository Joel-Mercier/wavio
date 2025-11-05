import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { themeConfig } from "@/config/theme";
import { useSearchPodcasts } from "@/hooks/taddyPodcasts/usePodcasts";
import useDebounce from "@/hooks/useDebounce";
import { loadingData } from "@/utils/loadingData";
import { FlashList } from "@shopify/flash-list";
import { useForm, useStore } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import { ArrowLeft, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";

export default function PodcastsSearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const debounce = useDebounce();
  const form = useForm({
    defaultValues: {
      query: "",
    },
  });
  const query = useStore(form.store, (state) => state.values.query);
  const { data, isLoading, error } = useSearchPodcasts({ searchTerm: query });

  const handleSearchClearPress = () => {
    form.setFieldValue("query", "");
  };

  return (
    <SafeAreaView className="h-full" edges={["bottom", "left", "right"]}>
      <FlashList
        data={loadingData(6)}
        keyExtractor={(item) => item.id}
        renderItem={({
          item,
          index,
        }: {
          item: any;
          index: number;
        }) => <Box className="px-6"></Box>}
        contentInsetAdjustmentBehavior="automatic"
        ListEmptyComponent={<EmptyDisplay />}
        ListHeaderComponent={
          <>
            <Box className="bg-primary-600 px-6 py-6 mb-6">
              <SafeAreaView edges={["top"]}>
                <HStack className="items-center">
                  <FadeOutScaleDown
                    className="mr-4"
                    onPress={() => router.back()}
                  >
                    <ArrowLeft size={24} color="white" />
                  </FadeOutScaleDown>
                  <form.Field name="query">
                    {(field) => (
                      <Input className="flex-1 border-0">
                        <InputField
                          className="text-white text-xl"
                          placeholder={t("app.library.search.inputPlaceholder")}
                          placeholderTextColor={
                            themeConfig.theme.colors.primary[50]
                          }
                          type="text"
                          value={field.state.value}
                          onChangeText={field.handleChange}
                          onBlur={field.handleBlur}
                          enterKeyHint="search"
                        />
                        <InputSlot
                          className="pr-3"
                          onPress={handleSearchClearPress}
                        >
                          <InputIcon as={X} size="xl" />
                        </InputSlot>
                      </Input>
                    )}
                  </form.Field>
                </HStack>
              </SafeAreaView>
            </Box>
            {error && <ErrorDisplay error={error} />}
          </>
        }
      />
    </SafeAreaView>
  );
}
