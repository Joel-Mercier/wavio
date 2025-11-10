import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import PodcastSeriesListItem from "@/components/podcasts/PodcastSeriesListItem";
import PodcastSeriesListItemSkeleton from "@/components/podcasts/PodcastSeriesListItemSkeleton";
import { Box } from "@/components/ui/box";
import {
  FormControl,
  FormControlLabel,
  FormControlLabelText,
} from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { themeConfig } from "@/config/theme";
import { useSearchPodcasts } from "@/hooks/taddyPodcasts/usePodcasts";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useDebounce from "@/hooks/useDebounce";
import {
  Country,
  Genre,
  Language,
  PodcastContentType,
  type PodcastSeries,
  SearchMatchType,
  SearchSortOrder,
} from "@/services/taddyPodcasts/types";
import { loadingData } from "@/utils/loadingData";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useForm, useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft, Settings2, X } from "lucide-react-native";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import z from "zod";

const filtersSchema = z.object({
  query: z.string().trim().min(1),
  filterForCountries: z.array(z.enum(Country)).optional(),
  filterForLanguages: z.array(z.enum(Language)).optional(),
  filterForGenres: z.array(z.enum(Genre)).optional(),
  filterForPodcastContentType: z.array(z.enum(PodcastContentType)).optional(),
  filterForPublishedAfter: z.number().optional(),
  filterForPublishedBefore: z.number().optional(),
  filterForDurationGreaterThan: z.number().optional(),
  filterForDurationLessThan: z.number().optional(),
  sortBy: z.enum(SearchSortOrder).optional(),
  matchBy: z.enum(SearchMatchType).optional(),
  isSafeMode: z.boolean().optional(),
});

export default function PodcastsSearchScreen() {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const queryClient = useQueryClient();
  const router = useRouter();
  const debounce = useDebounce();
  const form = useForm({
    defaultValues: {
      query: "",
      page: 1,
      filterForCountries: undefined,
      filterForLanguages: undefined,
      filterForGenres: undefined,
      filterForPodcastContentType: undefined,
      filterForPublishedAfter: undefined,
      filterForPublishedBefore: undefined,
      filterForDurationGreaterThan: undefined,
      filterForDurationLessThan: undefined,
      sortBy: undefined,
      matchBy: undefined,
      isSafeMode: undefined,
    },
    validators: {
      onBlur: filtersSchema,
    },
    onSubmit: async ({ value }) => {
      bottomSheetModalRef.current?.dismiss();
      await refetch();
    },
  });
  const values = useStore(form.store, (state) => state.values);
  const { query, ...restValues } = values;
  const { data, isLoading, error, refetch } = useSearchPodcasts({
    searchTerm: query || "",
    filterForTypes: ["PODCASTSERIES"],
    ...restValues,
  });

  const handleSearchClearPress = () => {
    form.setFieldValue("query", "");
    queryClient.invalidateQueries({ queryKey: ["taddyPodcasts:search"] });
  };

  const handlePresentModalPress = () => {
    bottomSheetModalRef.current?.present();
  };

  console.log(query, data);

  return (
    <Box className="h-full">
      <Box className="bg-primary-600 px-6 py-6">
        <Box style={{ paddingTop: insets.top }}>
          <HStack className="items-center">
            <FadeOutScaleDown className="mr-4" onPress={() => router.back()}>
              <ArrowLeft size={24} color="white" />
            </FadeOutScaleDown>
            <form.Field name="query">
              {(field) => (
                <Input className="flex-1 border-0">
                  <InputField
                    className="text-white text-xl"
                    placeholder={t("app.podcasts.search.inputPlaceholder")}
                    placeholderTextColor={themeConfig.theme.colors.primary[50]}
                    type="text"
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={field.handleBlur}
                    enterKeyHint="search"
                    autoFocus
                  />
                  <InputSlot className="pr-3" onPress={handleSearchClearPress}>
                    <InputIcon as={X} size="xl" />
                  </InputSlot>
                  <InputSlot className="pr-3" onPress={handlePresentModalPress}>
                    <InputIcon
                      as={Settings2}
                      color={themeConfig.theme.colors.white}
                      width={38}
                      height={38}
                      size="2xl"
                    />
                  </InputSlot>
                </Input>
              )}
            </form.Field>
          </HStack>
        </Box>
      </Box>
      <FlashList
        data={data?.data?.search?.podcastSeries || loadingData(6)}
        keyExtractor={(item) => item.uuid}
        renderItem={({
          item,
          index,
        }: {
          item: PodcastSeries;
          index: number;
        }) =>
          isLoading ? (
            <PodcastSeriesListItemSkeleton index={index} layout="vertical" />
          ) : (
            <PodcastSeriesListItem
              podcast={item}
              layout="vertical"
              index={index}
            />
          )
        }
        ListEmptyComponent={<EmptyDisplay />}
        ListHeaderComponent={error && <ErrorDisplay error={error} />}
        contentContainerStyle={{
          paddingBottom: tabBarHeight + FLOATING_PLAYER_HEIGHT,
        }}
        showsVerticalScrollIndicator={false}
      />
      <BottomSheetModal
        ref={bottomSheetModalRef}
        onChange={handleSheetPositionChange}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView
          style={{
            flex: 1,
            alignItems: "center",
          }}
        >
          <Box className="p-6 w-full mb-12">
            <Heading className="text-white" size="lg">
              {t("app.podcasts.search.filters")}
            </Heading>
            <form.Field name="isSafeMode">
              {(field) => (
                <FormControl
                  isInvalid={!field.state.meta.isValid}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <FormControlLabel>
                    <FormControlLabelText className="text-white">
                      {t("app.podcasts.search.safeModeLabel")}
                    </FormControlLabelText>
                  </FormControlLabel>
                  <Switch
                    size="md"
                    trackColor={{
                      false: themeConfig.theme.colors.gray[500],
                      true: themeConfig.theme.colors.emerald[500],
                    }}
                    thumbColor={themeConfig.theme.colors.white}
                    ios_backgroundColor={themeConfig.theme.colors.white}
                    value={!!field.state.value}
                    onToggle={field.handleChange}
                  />
                </FormControl>
              )}
            </form.Field>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
    </Box>
  );
}
