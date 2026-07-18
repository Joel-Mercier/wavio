import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { useForm, useStore } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import ChevronDownIcon from "lucide-react-native/dist/esm/icons/chevron-down.mjs";
import Settings2 from "lucide-react-native/dist/esm/icons/settings-2.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import { KeyboardController } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import InternetRadioStationListItem, {
  radioBrowserToItem,
} from "@/components/internetRadioStations/InternetRadioStationListItem";
import InternetRadioStationListItemSkeleton from "@/components/internetRadioStations/InternetRadioStationListItemSkeleton";
import SearchableSelectSheet, {
  type SelectOption,
} from "@/components/internetRadioStations/SearchableSelectSheet";
import SheetSearchInput from "@/components/SheetSearchInput";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useInfiniteSearchStations,
  useRadioCountries,
  useRadioLanguages,
  useRadioTags,
} from "@/hooks/radioBrowser/useRadioBrowser";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useDebounce from "@/hooks/useDebounce";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { RadioBrowserStation } from "@/services/radioBrowser/types";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

export default function InternetRadioStationsSearchScreen() {
  const [primary50, white, emerald500] = Uniwind.getCSSVariable([
    "--color-primary-50",
    "--color-white",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const form = useForm({ defaultValues: { query: "" } });
  const query = useStore(form.store, (state) => state.values.query);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounce = useDebounce(300);

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [countryCode, setCountryCode] = useState<string | undefined>(undefined);
  const [language, setLanguage] = useState<string | undefined>(undefined);

  const filtersSheetRef = useRef<BottomSheetModal>(null);
  const countrySheetRef = useRef<BottomSheetModal>(null);
  const languageSheetRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange: handleFiltersSheetPositionChange } =
    useBottomSheetBackHandler(filtersSheetRef);
  const { handleSheetPositionChange: handleCountrySheetPositionChange } =
    useBottomSheetBackHandler(countrySheetRef);
  const { handleSheetPositionChange: handleLanguageSheetPositionChange } =
    useBottomSheetBackHandler(languageSheetRef);

  useEffect(() => {
    debounce(() => setDebouncedQuery(query));
  }, [query, debounce]);

  const { data: tagsData } = useRadioTags({ limit: 120 });
  const { data: countriesData } = useRadioCountries();
  const { data: languagesData } = useRadioLanguages();

  const filteredTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    const tags = tagsData ?? [];
    if (!q) return tags;
    return tags.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [tagQuery, tagsData]);

  const countryOptions = useMemo<SelectOption[]>(
    () =>
      (countriesData ?? [])
        .filter((c) => c.iso_3166_1 && c.name)
        .map((c) => ({ label: c.name, value: c.iso_3166_1 })),
    [countriesData],
  );
  const languageOptions = useMemo<SelectOption[]>(
    () =>
      (languagesData ?? [])
        .filter((l) => l.name)
        .map((l) => ({ label: l.name, value: l.name })),
    [languagesData],
  );

  const selectedCountryLabel = useMemo(
    () => countryOptions.find((o) => o.value === countryCode)?.label,
    [countryOptions, countryCode],
  );

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useInfiniteSearchStations({
    name: debouncedQuery,
    tags: selectedTags,
    countryCode,
    language,
  });

  const stations = useMemo(() => data?.pages.flat() ?? [], [data]);

  const activeFilterCount =
    selectedTags.length + (countryCode ? 1 : 0) + (language ? 1 : 0);
  const isActive = !!debouncedQuery.trim() || activeFilterCount > 0;
  const showSkeletons = isActive && isLoading;
  const listData = (
    showSkeletons ? loadingData(8) : stations
  ) as RadioBrowserStation[];

  const handleSearchClearPress = () => {
    form.setFieldValue("query", "");
  };

  const handlePresentFiltersPress = () => {
    // Dismiss the (auto-focused) keyboard first; presenting the sheet over an
    // open keyboard makes it appear late or not at all.
    KeyboardController.dismiss();
    filtersSheetRef.current?.present();
  };

  const handleToggleTag = (tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    );
  };

  const handleResetFilters = () => {
    setSelectedTags([]);
    setCountryCode(undefined);
    setLanguage(undefined);
  };

  const handleEndReached = () => {
    if (hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage();
    }
  };

  return (
    <Box className="h-full flex-1">
      <Box
        className="bg-primary-600 px-6 py-6 mb-6"
        style={{ paddingTop: insets.top + 24 }}
      >
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
                  placeholder={t(
                    "app.internetRadioStations.searchInputPlaceholder",
                  )}
                  placeholderTextColor={primary50}
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
                <InputSlot className="pr-1" onPress={handlePresentFiltersPress}>
                  <InputIcon as={Settings2} size="xl" />
                  {activeFilterCount > 0 && (
                    <Box className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500" />
                  )}
                </InputSlot>
              </Input>
            )}
          </form.Field>
        </HStack>
      </Box>
      <FlashList
        data={listData}
        keyExtractor={(item, index) =>
          (item as RadioBrowserStation)?.stationuuid ?? `skeleton-${index}`
        }
        renderItem={({ item, index }) =>
          showSkeletons ? (
            <InternetRadioStationListItemSkeleton
              layout="vertical"
              index={index}
            />
          ) : (
            <InternetRadioStationListItem
              station={radioBrowserToItem(item as RadioBrowserStation)}
              index={index}
              layout="vertical"
            />
          )
        }
        ListEmptyComponent={isActive && !isLoading ? <EmptyDisplay /> : null}
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
        snapPoints={["75%"]}
        onChange={handleFiltersSheetPositionChange}
        backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
        handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
      >
        <BottomSheetScrollView showsVerticalScrollIndicator={false}>
          <Box className="p-6 w-full">
            <Heading className="text-white" size="lg">
              {t("app.internetRadioStations.search.filters")}
            </Heading>

            <FadeOutScaleDown
              onPress={() => countrySheetRef.current?.present()}
              className="my-4"
            >
              <VStack className="gap-y-2">
                <Text className="text-white">
                  {t("app.internetRadioStations.search.country")}
                </Text>
                <HStack className="bg-primary-600 rounded-md px-6 py-3 items-center justify-between">
                  <Text className="text-md text-white">
                    {selectedCountryLabel ??
                      t("app.internetRadioStations.search.any")}
                  </Text>
                  <ChevronDownIcon size={18} color={white} />
                </HStack>
              </VStack>
            </FadeOutScaleDown>

            <FadeOutScaleDown
              onPress={() => languageSheetRef.current?.present()}
              className="my-4"
            >
              <VStack className="gap-y-2">
                <Text className="text-white">
                  {t("app.internetRadioStations.search.language")}
                </Text>
                <HStack className="bg-primary-600 rounded-md px-6 py-3 items-center justify-between">
                  <Text className="text-md text-white">
                    {language ?? t("app.internetRadioStations.search.any")}
                  </Text>
                  <ChevronDownIcon size={18} color={white} />
                </HStack>
              </VStack>
            </FadeOutScaleDown>

            <VStack className="gap-y-2 my-4">
              <Text className="text-white">
                {t("app.internetRadioStations.search.tags")}
              </Text>
              <SheetSearchInput onChangeText={setTagQuery} />
              <HStack className="flex-wrap gap-2 mt-2">
                {filteredTags.map((tag) => {
                  const selected = selectedTags.includes(tag.name);
                  return (
                    <FadeOutScaleDown
                      key={tag.name}
                      onPress={() => handleToggleTag(tag.name)}
                    >
                      <Badge
                        className={cn("rounded-full bg-gray-800 px-4 py-1", {
                          "bg-emerald-500": selected,
                        })}
                      >
                        <BadgeText className="normal-case text-md text-white">
                          {tag.name}
                        </BadgeText>
                      </Badge>
                    </FadeOutScaleDown>
                  );
                })}
              </HStack>
            </VStack>

            <HStack className="items-center justify-center gap-x-4 mt-4 mb-12">
              <FadeOutScaleDown
                onPress={handleResetFilters}
                className="items-center justify-center py-3 px-8 border border-white rounded-full"
              >
                <Text className="text-white font-bold text-lg">
                  {t("app.internetRadioStations.search.reset")}
                </Text>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() => filtersSheetRef.current?.dismiss()}
                className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
              >
                <Text className="text-primary-800 font-bold text-lg">
                  {t("app.internetRadioStations.search.done")}
                </Text>
              </FadeOutScaleDown>
            </HStack>
          </Box>
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>

      <SearchableSelectSheet
        ref={countrySheetRef}
        onSheetPositionChange={handleCountrySheetPositionChange}
        title={t("app.internetRadioStations.search.country")}
        anyLabel={t("app.internetRadioStations.search.any")}
        options={countryOptions}
        selectedValue={countryCode}
        onSelect={(value) => {
          setCountryCode(value || undefined);
          countrySheetRef.current?.dismiss();
        }}
        emerald={emerald500}
      />
      <SearchableSelectSheet
        ref={languageSheetRef}
        onSheetPositionChange={handleLanguageSheetPositionChange}
        title={t("app.internetRadioStations.search.language")}
        anyLabel={t("app.internetRadioStations.search.any")}
        options={languageOptions}
        selectedValue={language}
        onSelect={(value) => {
          setLanguage(value || undefined);
          languageSheetRef.current?.dismiss();
        }}
        emerald={emerald500}
      />
    </Box>
  );
}
