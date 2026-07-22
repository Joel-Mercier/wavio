import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { useForm, useSelector } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import ChevronDownIcon from "lucide-react-native/dist/esm/icons/chevron-down.mjs";
import Settings2 from "lucide-react-native/dist/esm/icons/settings-2.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import { KeyboardController } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import * as z from "zod";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { handleFieldBlur, showFieldError } from "@/components/forms/FieldError";
import PodcastSeriesListItem from "@/components/podcasts/PodcastSeriesListItem";
import PodcastSeriesListItemSkeleton from "@/components/podcasts/PodcastSeriesListItemSkeleton";
import SelectBottomSheet from "@/components/SelectBottomSheet";
import { Box } from "@/components/ui/box";
import {
  FormControl,
  FormControlLabel,
  FormControlLabelText,
} from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import {
  Select,
  SelectBackdrop,
  SelectContent,
  SelectDragIndicator,
  SelectDragIndicatorWrapper,
  SelectIcon,
  SelectInput,
  SelectItem,
  SelectPortal,
  SelectScrollView,
  SelectTrigger,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useInfiniteSearchPodcasts } from "@/hooks/taddyPodcasts/usePodcasts";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
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
import { goBackOrHome } from "@/utils/navigation";

const filtersSchema = z.object({
  query: z.string().trim().min(1),
  filterForCountries: z.array(z.enum(Country)).optional(),
  filterForLanguages: z.array(z.enum(Language)).optional(),
  filterForGenres: z.array(z.enum(Genre)).optional(),
  filterForPodcastContentType: z.array(z.enum(PodcastContentType)).optional(),
  filterForDurationGreaterThan: z.number().optional(),
  filterForDurationLessThan: z.number().optional(),
  filterForHasTranscript: z.boolean().optional(),
  sortBy: z.enum(SearchSortOrder).optional(),
  matchBy: z.enum(SearchMatchType).optional(),
  isSafeMode: z.boolean().optional(),
});

type FiltersValues = z.input<typeof filtersSchema>;

const cleanArray = <T,>(value: T[] | undefined) =>
  value && value.length > 0 ? value : undefined;

const minutesToSeconds = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value * 60)
    : undefined;

export default function PodcastsSearchScreen() {
  const [primary50, primary100, white, gray500, emerald500] =
    Uniwind.getCSSVariable([
      "--color-primary-50",
      "--color-primary-100",
      "--color-white",
      "--color-gray-500",
      "--color-emerald-500",
    ]) as string[];
  const filtersSheetRef = useRef<BottomSheetModal>(null);
  const languagesSheetRef = useRef<BottomSheetModal>(null);
  const countriesSheetRef = useRef<BottomSheetModal>(null);
  const genresSheetRef = useRef<BottomSheetModal>(null);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const queryClient = useQueryClient();
  const router = useRouter();
  const form = useForm({
    defaultValues: {
      query: "",
      filterForCountries: undefined,
      filterForLanguages: undefined,
      filterForGenres: undefined,
      filterForPodcastContentType: undefined,
      filterForDurationGreaterThan: undefined,
      filterForDurationLessThan: undefined,
      filterForHasTranscript: undefined,
      sortBy: undefined,
      matchBy: undefined,
      isSafeMode: undefined,
    } as FiltersValues,
    validators: {
      onChange: filtersSchema,
    },
    onSubmit: () => {
      filtersSheetRef.current?.dismiss();
    },
  });
  const values = useSelector(form.store, (state) => state.values);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useInfiniteSearchPodcasts({
    searchTerm: values.query || "",
    filterForTypes: ["PODCASTSERIES"],
    filterForCountries: cleanArray(values.filterForCountries),
    filterForLanguages: cleanArray(values.filterForLanguages),
    filterForGenres: cleanArray(values.filterForGenres),
    filterForPodcastContentType: cleanArray(values.filterForPodcastContentType),
    filterForDurationGreaterThan: minutesToSeconds(
      values.filterForDurationGreaterThan,
    ),
    filterForDurationLessThan: minutesToSeconds(
      values.filterForDurationLessThan,
    ),
    filterForHasTranscript: values.filterForHasTranscript,
    sortBy: values.sortBy,
    matchBy: values.matchBy,
    isSafeMode: values.isSafeMode,
  });

  const podcasts = useMemo(
    () =>
      data?.pages.flatMap((page) => page.data?.search?.podcastSeries ?? []) ??
      [],
    [data],
  );

  const handleSearchClearPress = () => {
    form.setFieldValue("query", "");
    queryClient.invalidateQueries({ queryKey: ["taddyPodcasts:search"] });
  };

  const handlePresentFiltersPress = () => {
    KeyboardController.dismiss();
    filtersSheetRef.current?.present();
  };

  const handleResetFiltersPress = () => {
    const query = form.getFieldValue("query");
    form.reset();
    form.setFieldValue("query", query);
  };

  const handleEndReached = () => {
    if (hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage();
    }
  };

  const toggleArrayValue = <T extends string>(
    fieldName: "filterForLanguages" | "filterForCountries" | "filterForGenres",
    current: T[] | undefined,
    value: T,
  ) => {
    const set = new Set<string>(current ?? []);
    if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }
    const next = Array.from(set) as T[];
    form.setFieldValue(
      fieldName,
      // biome-ignore lint/suspicious/noExplicitAny: union of array enum types
      (next.length > 0 ? next : undefined) as any,
    );
  };

  const languageEntries = Object.values(Language) as (keyof typeof Language)[];
  const countryEntries = Object.values(Country) as (keyof typeof Country)[];
  const genreEntries = Object.values(Genre) as (keyof typeof Genre)[];
  const sortByOptions = Object.values(
    SearchSortOrder,
  ) as (keyof typeof SearchSortOrder)[];
  const matchByOptions = Object.values(
    SearchMatchType,
  ) as (keyof typeof SearchMatchType)[];
  const contentTypeOptions = Object.values(
    PodcastContentType,
  ) as (keyof typeof PodcastContentType)[];

  const hasQuery = !!values.query?.trim();
  const showSkeletons = hasQuery && isLoading;
  const listData: (PodcastSeries | { id: number })[] = showSkeletons
    ? loadingData(6)
    : podcasts;

  return (
    <Box className="h-full">
      <Box className="bg-primary-600 px-6 py-6">
        <Box style={{ paddingTop: insets.top }}>
          <HStack className="items-center">
            <FadeOutScaleDown
              className="mr-4"
              onPress={() => goBackOrHome(router)}
            >
              <ArrowLeft size={24} color="white" />
            </FadeOutScaleDown>
            <form.Field name="query">
              {(field) => (
                <Input className="flex-1 border-0">
                  <InputField
                    disableFullscreenUI
                    className="text-white text-xl"
                    placeholder={t("app.podcasts.search.inputPlaceholder")}
                    placeholderTextColor={primary50}
                    type="text"
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={() => handleFieldBlur(field)}
                    enterKeyHint="search"
                    autoFocus
                  />
                  <InputSlot className="pr-3" onPress={handleSearchClearPress}>
                    <InputIcon as={X} size="xl" />
                  </InputSlot>
                  <InputSlot
                    className="pr-3"
                    onPress={handlePresentFiltersPress}
                  >
                    <InputIcon
                      as={Settings2}
                      color={primary100}
                      width={38}
                      height={38}
                      size="xl"
                    />
                  </InputSlot>
                </Input>
              )}
            </form.Field>
          </HStack>
        </Box>
      </Box>
      <FlashList
        data={listData as PodcastSeries[]}
        keyExtractor={(item, index) =>
          "uuid" in item ? item.uuid : `skeleton-${index}`
        }
        renderItem={({ item, index }) =>
          showSkeletons ? (
            <PodcastSeriesListItemSkeleton index={index} layout="vertical" />
          ) : (
            <PodcastSeriesListItem
              podcast={item as PodcastSeries}
              layout="vertical"
              index={index}
            />
          )
        }
        ListEmptyComponent={hasQuery && !isLoading ? <EmptyDisplay /> : null}
        ListHeaderComponent={error ? <ErrorDisplay error={error} /> : null}
        ListFooterComponent={
          isFetchingNextPage ? (
            <Box className="py-6">
              <ActivityIndicator color={emerald500} />
            </Box>
          ) : null
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{
          paddingBottom: screenBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
      />

      <CenteredBottomSheetModal
        ref={filtersSheetRef}
        snapPoints={["85%"]}
        backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
        handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
      >
        <BottomSheetScrollView showsVerticalScrollIndicator={false}>
          <Box className="p-6 w-full">
            <Heading className="text-white" size="lg">
              {t("app.podcasts.search.filters")}
            </Heading>

            <form.Field name="sortBy">
              {(field) => (
                <FormControl
                  isInvalid={showFieldError(field)}
                  size="md"
                  className="my-4"
                >
                  <FormControlLabel>
                    <FormControlLabelText className="text-white">
                      {t("app.podcasts.search.sortByLabel")}
                    </FormControlLabelText>
                  </FormControlLabel>
                  <Select
                    selectedValue={field.state.value ?? ""}
                    onValueChange={(value) =>
                      field.handleChange(
                        (value || undefined) as SearchSortOrder,
                      )
                    }
                    closeOnOverlayClick
                  >
                    <SelectTrigger className="bg-primary-600 border border-primary-600 rounded-md px-6 py-3">
                      <SelectInput
                        className="text-md text-white"
                        placeholder={t("app.podcasts.search.sortByPlaceholder")}
                        value={
                          field.state.value
                            ? t(
                                `app.podcasts.search.sortOrders.${field.state.value}`,
                              )
                            : ""
                        }
                      />
                      <SelectIcon className="mr-3" as={ChevronDownIcon} />
                    </SelectTrigger>
                    <SelectPortal>
                      <SelectBackdrop />
                      <SelectContent
                        style={{ backgroundColor: "rgb(41, 41, 41)" }}
                      >
                        <SelectDragIndicatorWrapper>
                          <SelectDragIndicator />
                        </SelectDragIndicatorWrapper>
                        <SelectScrollView>
                          {sortByOptions.map((option) => (
                            <SelectItem
                              key={option}
                              label={t(
                                `app.podcasts.search.sortOrders.${option}`,
                              )}
                              value={option}
                              textStyle={{ className: "text-white" }}
                            />
                          ))}
                        </SelectScrollView>
                      </SelectContent>
                    </SelectPortal>
                  </Select>
                </FormControl>
              )}
            </form.Field>

            <form.Field name="matchBy">
              {(field) => (
                <FormControl
                  isInvalid={showFieldError(field)}
                  size="md"
                  className="my-4"
                >
                  <FormControlLabel>
                    <FormControlLabelText className="text-white">
                      {t("app.podcasts.search.matchByLabel")}
                    </FormControlLabelText>
                  </FormControlLabel>
                  <Select
                    selectedValue={field.state.value ?? ""}
                    onValueChange={(value) =>
                      field.handleChange(
                        (value || undefined) as SearchMatchType,
                      )
                    }
                    closeOnOverlayClick
                  >
                    <SelectTrigger className="bg-primary-600 border border-primary-600 rounded-md px-6 py-3">
                      <SelectInput
                        className="text-md text-white"
                        placeholder={t(
                          "app.podcasts.search.matchByPlaceholder",
                        )}
                        value={
                          field.state.value
                            ? t(
                                `app.podcasts.search.matchTypes.${field.state.value}`,
                              )
                            : ""
                        }
                      />
                      <SelectIcon className="mr-3" as={ChevronDownIcon} />
                    </SelectTrigger>
                    <SelectPortal>
                      <SelectBackdrop />
                      <SelectContent
                        style={{ backgroundColor: "rgb(41, 41, 41)" }}
                      >
                        <SelectDragIndicatorWrapper>
                          <SelectDragIndicator />
                        </SelectDragIndicatorWrapper>
                        <SelectScrollView>
                          {matchByOptions.map((option) => (
                            <SelectItem
                              key={option}
                              label={t(
                                `app.podcasts.search.matchTypes.${option}`,
                              )}
                              value={option}
                              textStyle={{ className: "text-white" }}
                            />
                          ))}
                        </SelectScrollView>
                      </SelectContent>
                    </SelectPortal>
                  </Select>
                </FormControl>
              )}
            </form.Field>

            <form.Field name="filterForPodcastContentType">
              {(field) => {
                const current = field.state.value?.[0] ?? "";
                return (
                  <FormControl size="md" className="my-4">
                    <FormControlLabel>
                      <FormControlLabelText className="text-white">
                        {t("app.podcasts.search.contentTypeLabel")}
                      </FormControlLabelText>
                    </FormControlLabel>
                    <Select
                      selectedValue={current}
                      onValueChange={(value) =>
                        field.handleChange(
                          value ? [value as PodcastContentType] : undefined,
                        )
                      }
                      closeOnOverlayClick
                    >
                      <SelectTrigger className="bg-primary-600 border border-primary-600 rounded-md px-6 py-3">
                        <SelectInput
                          className="text-md text-white"
                          placeholder={t(
                            "app.podcasts.search.contentTypePlaceholder",
                          )}
                          value={
                            current
                              ? t(`app.podcasts.search.contentTypes.${current}`)
                              : ""
                          }
                        />
                        <SelectIcon className="mr-3" as={ChevronDownIcon} />
                      </SelectTrigger>
                      <SelectPortal>
                        <SelectBackdrop />
                        <SelectContent
                          style={{ backgroundColor: "rgb(41, 41, 41)" }}
                        >
                          <SelectDragIndicatorWrapper>
                            <SelectDragIndicator />
                          </SelectDragIndicatorWrapper>
                          <SelectScrollView>
                            {contentTypeOptions.map((option) => (
                              <SelectItem
                                key={option}
                                label={t(
                                  `app.podcasts.search.contentTypes.${option}`,
                                )}
                                value={option}
                                textStyle={{ className: "text-white" }}
                              />
                            ))}
                          </SelectScrollView>
                        </SelectContent>
                      </SelectPortal>
                    </Select>
                  </FormControl>
                );
              }}
            </form.Field>

            <form.Field name="filterForLanguages">
              {(field) => (
                <FadeOutScaleDown
                  onPress={() => languagesSheetRef.current?.present()}
                  className="my-4"
                >
                  <VStack className="gap-y-2">
                    <Text className="text-white">
                      {t("app.podcasts.search.languagesLabel")}
                    </Text>
                    <HStack className="bg-primary-600 rounded-md px-6 py-3 items-center justify-between">
                      <Text className="text-md text-white">
                        {field.state.value?.length
                          ? t("app.podcasts.search.selectedCount", {
                              count: field.state.value.length,
                            })
                          : t("app.podcasts.search.languagesPlaceholder")}
                      </Text>
                      <ChevronDownIcon size={18} color={white} />
                    </HStack>
                  </VStack>
                </FadeOutScaleDown>
              )}
            </form.Field>

            <form.Field name="filterForCountries">
              {(field) => (
                <FadeOutScaleDown
                  onPress={() => countriesSheetRef.current?.present()}
                  className="my-4"
                >
                  <VStack className="gap-y-2">
                    <Text className="text-white">
                      {t("app.podcasts.search.countriesLabel")}
                    </Text>
                    <HStack className="bg-primary-600 rounded-md px-6 py-3 items-center justify-between">
                      <Text className="text-md text-white">
                        {field.state.value?.length
                          ? t("app.podcasts.search.selectedCount", {
                              count: field.state.value.length,
                            })
                          : t("app.podcasts.search.countriesPlaceholder")}
                      </Text>
                      <ChevronDownIcon size={18} color={white} />
                    </HStack>
                  </VStack>
                </FadeOutScaleDown>
              )}
            </form.Field>

            <form.Field name="filterForGenres">
              {(field) => (
                <FadeOutScaleDown
                  onPress={() => genresSheetRef.current?.present()}
                  className="my-4"
                >
                  <VStack className="gap-y-2">
                    <Text className="text-white">
                      {t("app.podcasts.search.genresLabel")}
                    </Text>
                    <HStack className="bg-primary-600 rounded-md px-6 py-3 items-center justify-between">
                      <Text className="text-md text-white">
                        {field.state.value?.length
                          ? t("app.podcasts.search.selectedCount", {
                              count: field.state.value.length,
                            })
                          : t("app.podcasts.search.genresPlaceholder")}
                      </Text>
                      <ChevronDownIcon size={18} color={white} />
                    </HStack>
                  </VStack>
                </FadeOutScaleDown>
              )}
            </form.Field>

            <FormControl size="md" className="my-4">
              <FormControlLabel>
                <FormControlLabelText className="text-white">
                  {t("app.podcasts.search.durationLabel")}
                </FormControlLabelText>
              </FormControlLabel>
              <HStack className="gap-x-3">
                <form.Field name="filterForDurationGreaterThan">
                  {(field) => (
                    <Input className="flex-1 border border-primary-600 bg-primary-600 rounded-md px-4 py-2">
                      <InputField
                        disableFullscreenUI
                        className="text-md text-white"
                        placeholder={t(
                          "app.podcasts.search.durationMinPlaceholder",
                        )}
                        placeholderTextColor={primary50}
                        keyboardType="numeric"
                        value={
                          field.state.value !== undefined
                            ? String(field.state.value)
                            : ""
                        }
                        onChangeText={(text) => {
                          const parsed = Number.parseInt(text, 10);
                          field.handleChange(
                            Number.isFinite(parsed) ? parsed : undefined,
                          );
                        }}
                      />
                    </Input>
                  )}
                </form.Field>
                <form.Field name="filterForDurationLessThan">
                  {(field) => (
                    <Input className="flex-1 border border-primary-600 bg-primary-600 rounded-md px-4 py-2">
                      <InputField
                        disableFullscreenUI
                        className="text-md text-white"
                        placeholder={t(
                          "app.podcasts.search.durationMaxPlaceholder",
                        )}
                        placeholderTextColor={primary50}
                        keyboardType="numeric"
                        value={
                          field.state.value !== undefined
                            ? String(field.state.value)
                            : ""
                        }
                        onChangeText={(text) => {
                          const parsed = Number.parseInt(text, 10);
                          field.handleChange(
                            Number.isFinite(parsed) ? parsed : undefined,
                          );
                        }}
                      />
                    </Input>
                  )}
                </form.Field>
              </HStack>
            </FormControl>

            <form.Field name="filterForHasTranscript">
              {(field) => (
                <FormControl size="md" className="my-4">
                  <HStack className="items-center justify-between">
                    <FormControlLabel>
                      <FormControlLabelText className="text-white">
                        {t("app.podcasts.search.hasTranscriptLabel")}
                      </FormControlLabelText>
                    </FormControlLabel>
                    <Switch
                      size="md"
                      trackColor={{ false: gray500, true: emerald500 }}
                      thumbColor={white}
                      ios_backgroundColor={white}
                      value={!!field.state.value}
                      onToggle={(value) =>
                        field.handleChange(value || undefined)
                      }
                    />
                  </HStack>
                </FormControl>
              )}
            </form.Field>

            <form.Field name="isSafeMode">
              {(field) => (
                <FormControl size="md" className="my-4">
                  <HStack className="items-center justify-between">
                    <FormControlLabel>
                      <FormControlLabelText className="text-white">
                        {t("app.podcasts.search.safeModeLabel")}
                      </FormControlLabelText>
                    </FormControlLabel>
                    <Switch
                      size="md"
                      trackColor={{ false: gray500, true: emerald500 }}
                      thumbColor={white}
                      ios_backgroundColor={white}
                      value={!!field.state.value}
                      onToggle={(value) =>
                        field.handleChange(value || undefined)
                      }
                    />
                  </HStack>
                </FormControl>
              )}
            </form.Field>

            <HStack className="items-center justify-center gap-x-4 mt-4 mb-12">
              <FadeOutScaleDown
                onPress={handleResetFiltersPress}
                className="items-center justify-center py-3 px-8 border border-white rounded-full"
              >
                <Text className="text-white font-bold text-lg">
                  {t("app.podcasts.search.reset")}
                </Text>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() => form.handleSubmit()}
                className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
              >
                <Text className="text-primary-800 font-bold text-lg">
                  {t("app.podcasts.search.apply")}
                </Text>
              </FadeOutScaleDown>
            </HStack>
          </Box>
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>

      <SelectBottomSheet
        sheetRef={languagesSheetRef}
        title={t("app.podcasts.search.languagesLabel")}
        multiple
        searchable
        options={languageEntries.map((value) => ({
          label: value.replaceAll("_", " "),
          value,
        }))}
        selectedValues={values.filterForLanguages ?? []}
        onSelect={(value) =>
          toggleArrayValue(
            "filterForLanguages",
            values.filterForLanguages,
            value as keyof typeof Language,
          )
        }
      />
      <SelectBottomSheet
        sheetRef={countriesSheetRef}
        title={t("app.podcasts.search.countriesLabel")}
        multiple
        searchable
        options={countryEntries.map((value) => ({
          label: value.replaceAll("_", " "),
          value,
        }))}
        selectedValues={values.filterForCountries ?? []}
        onSelect={(value) =>
          toggleArrayValue(
            "filterForCountries",
            values.filterForCountries,
            value as keyof typeof Country,
          )
        }
      />
      <SelectBottomSheet
        sheetRef={genresSheetRef}
        title={t("app.podcasts.search.genresLabel")}
        multiple
        searchable
        options={genreEntries.map((value) => ({
          label: t(`app.podcasts.genres.${value}`, value),
          value,
        }))}
        selectedValues={values.filterForGenres ?? []}
        onSelect={(value) =>
          toggleArrayValue(
            "filterForGenres",
            values.filterForGenres,
            value as keyof typeof Genre,
          )
        }
      />
    </Box>
  );
}
