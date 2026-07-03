import { FlashList } from "@shopify/flash-list";
import { useForm, useStore } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import EmptyDisplay from "@/components/EmptyDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import RecentSearchListItem from "@/components/search/RecentSearchListItem";
import SearchResultListItem from "@/components/search/SearchResultListItem";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useSearch3 } from "@/hooks/backend/useSearching";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { AlbumID3, ArtistID3, Child } from "@/services/openSubsonic/types";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import useRecentSearches, { type RecentSearch } from "@/stores/recentSearches";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

export default function RecentSearchesScreen() {
  const [primary50] = Uniwind.getCSSVariable([
    "--color-primary-50",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const screenBottomPadding = useScreenBottomPadding();
  const insets = useSafeAreaInsets();
  const recentSearches = useRecentSearches((store) => store.recentSearches);
  const clearRecentSearches = useRecentSearches(
    (store) => store.clearRecentSearches,
  );
  const removeRecentSearch = useRecentSearches(
    (store) => store.removeRecentSearch,
  );
  const addRecentSearch = useRecentSearches((store) => store.addRecentSearch);
  const form = useForm({
    defaultValues: {
      query: "",
    },
  });
  const query = useStore(form.store, (state) => state.values.query);
  const musicFolderId = useCurrentMusicFolderId();
  const { data, isLoading, error } = useSearch3(query, {
    albumCount: 12,
    albumOffset: 0,
    songCount: 12,
    songOffset: 0,
    artistCount: 12,
    artistOffset: 0,
    musicFolderId,
  });

  const searchData = useMemo(() => {
    if (!data || !data?.searchResult3) {
      return [];
    }

    const searchData = [];
    if (data?.searchResult3?.artist) {
      searchData.push(...data.searchResult3.artist);
    }
    if (data?.searchResult3?.album) {
      searchData.push(...data.searchResult3.album);
    }
    if (data?.searchResult3?.song) {
      searchData.push(...data.searchResult3.song);
    }
    return searchData;
  }, [data]);

  const handleClearAllPress = () => {
    clearRecentSearches();
  };

  const handleRecentSearchDeletePress = (id: string) => {
    removeRecentSearch(id);
  };

  const handleSearchClearPress = () => {
    form.setFieldValue("query", "");
  };

  const handleOnSumbit = () => {
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      addRecentSearch({
        id: `query:${trimmed}`,
        title: trimmed,
        type: "query",
      });
    }
    router.navigate(`/(app)/(tabs)/(search)/search-results?query=${query}`);
  };

  return (
    <Box className="h-full">
      <Box
        className="bg-primary-600 px-6 py-6"
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
                  autoFocus
                  className="text-white text-xl"
                  placeholder={t("app.search.inputPlaceholder")}
                  placeholderTextColor={primary50}
                  type="text"
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={field.handleBlur}
                  enterKeyHint="search"
                  onSubmitEditing={handleOnSumbit}
                />
                <InputSlot
                  testID="search-clear-button"
                  className="pr-3"
                  onPress={handleSearchClearPress}
                >
                  <InputIcon as={X} size="xl" />
                </InputSlot>
              </Input>
            )}
          </form.Field>
        </HStack>
      </Box>
      <FlashList
        data={query.length === 0 ? recentSearches : searchData}
        keyExtractor={(item) => item.id}
        extraData={{ query }}
        renderItem={({
          item,
          index,
          target,
          extraData,
        }: {
          item: RecentSearch | Child | ArtistID3 | AlbumID3;
          index: number;
          target: string;
          extraData?: { query: string };
        }) => (
          <Box className={cn("px-6", { "mt-6": index === 0 })}>
            {!extraData?.query?.length ? (
              <RecentSearchListItem
                recentSearch={item as RecentSearch}
                handleDeletePress={handleRecentSearchDeletePress}
              />
            ) : (
              <SearchResultListItem
                searchResult={item as AlbumID3 & Child & ArtistID3}
              />
            )}
          </Box>
        )}
        ListEmptyComponent={<EmptyDisplay />}
        ListHeaderComponent={
          query.length === 0 ? (
            <Heading className="text-white ml-6 my-6">
              {t("app.search.recentSearches")}
            </Heading>
          ) : null
        }
        ListFooterComponent={
          <Box>
            {query.length === 0 && recentSearches.length > 0 && (
              <Center className="my-6">
                <FadeOutScaleDown
                  onPress={handleClearAllPress}
                  className="rounded-full border border-white py-1 px-3"
                >
                  <Text className="text-white">
                    {t("app.search.clearRecentSearches")}
                  </Text>
                </FadeOutScaleDown>
              </Center>
            )}
          </Box>
        }
        contentContainerStyle={{
          paddingBottom: screenBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </Box>
  );
}
