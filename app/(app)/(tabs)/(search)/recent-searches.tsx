import EmptyDisplay from "@/components/EmptyDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import RecentSearchListItem from "@/components/search/RecentSearchListItem";
import SearchResultListItem from "@/components/search/SearchResultListItem";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { themeConfig } from "@/config/theme";
import { useSearch3 } from "@/hooks/openSubsonic/useSearching";
import type { AlbumID3, ArtistID3, Child } from "@/services/openSubsonic/types";
import useRecentSearches, { type RecentSearch } from "@/stores/recentSearches";
import { cn } from "@/utils/tailwind";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useForm, useStore } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import { ArrowLeft, X } from "lucide-react-native";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function RecentSearchesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const recentSearches = useRecentSearches.use.recentSearches();
  const clearRecentSearches = useRecentSearches.use.clearRecentSearches();
  const removeRecentSearch = useRecentSearches.use.removeRecentSearch();
  const form = useForm({
    defaultValues: {
      query: "",
    },
  });
  const query = useStore(form.store, (state) => state.values.query);
  const { data, isLoading, error } = useSearch3(query, {
    albumCount: 12,
    albumOffset: 0,
    songCount: 12,
    songOffset: 0,
    artistCount: 12,
    artistOffset: 0,
  });

  const searchData = useMemo(() => {
    if (!data || !data?.searchResult3) {
      return [];
    }

    const searchData = [];
    if (data?.searchResult3?.album) {
      searchData.push(...data.searchResult3.album);
    }
    if (data?.searchResult3?.artist) {
      searchData.push(...data.searchResult3.artist);
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
    router.navigate(`/(app)/(tabs)/(search)/search-results?query=${query}`);
  };

  return (
    <Box className="h-full">
      <Box
        className="bg-primary-600 px-6 py-6"
        style={{ paddingTop: insets.top + 24 }}
      >
        <HStack className="items-center">
          <FadeOutScaleDown className="mr-4" onPress={() => router.back()}>
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <form.Field name="query">
            {(field) => (
              <Input className="flex-1 border-0">
                <InputField
                  autoFocus
                  className="text-white text-xl"
                  placeholder={t("app.search.inputPlaceholder")}
                  placeholderTextColor={themeConfig.theme.colors.primary[50]}
                  type="text"
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={field.handleBlur}
                  enterKeyHint="search"
                  onSubmitEditing={handleOnSumbit}
                />
                <InputSlot className="pr-3" onPress={handleSearchClearPress}>
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
          extraData: { query: string };
        }) => (
          <Box className={cn("px-6", { "mt-6": index === 0 })}>
            {extraData.query.length === 0 ? (
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
          query.length === 0 && (
            <Heading className="text-white ml-6 my-6">
              {t("app.search.recentSearches")}
            </Heading>
          )
        }
        ListFooterComponent={
          <Box>
            {query.length === 0 && recentSearches.length > 0 && (
              <Center className="my-6">
                <FadeOutScaleDown>
                  <Button
                    variant="outline"
                    action="default"
                    className="rounded-full border-white"
                    onPress={handleClearAllPress}
                  >
                    <ButtonText className="text-white">
                      {t("app.search.clearRecentSearches")}
                    </ButtonText>
                  </Button>
                </FadeOutScaleDown>
              </Center>
            )}
          </Box>
        }
        contentContainerStyle={{
          paddingBottom: bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
        }}
      />
    </Box>
  );
}
