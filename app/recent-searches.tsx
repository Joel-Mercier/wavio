import EmptyDisplay from "@/components/EmptyDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import RecentSearchListItem from "@/components/search/RecentSearchListItem";
import SearchResultListItem from "@/components/search/SearchResultListItem";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { themeConfig } from "@/config/theme";
import { useSearch3 } from "@/hooks/openSubsonic/useSearching";
import type { AlbumID3, ArtistID3, Child } from "@/services/openSubsonic/types";
import useRecentSearches, { type RecentSearch } from "@/stores/recentSearches";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { ArrowLeft, X } from "lucide-react-native";
import { useMemo, useState } from "react";

export default function RecentSearchesScreen() {
  const [query, setQuery] = useState<string>("");
  const router = useRouter();
  const recentSearches = useRecentSearches.use.recentSearches();
  const setRecentSearches = useRecentSearches.use.setRecentSearches();
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
      searchData.push(...data?.searchResult3?.album);
    }
    if (data?.searchResult3?.artist) {
      searchData.push(...data?.searchResult3?.artist);
    }
    if (data?.searchResult3?.song) {
      searchData.push(...data?.searchResult3?.song);
    }
    return searchData;
  }, [data]);

  const handleClearAllPress = () => {
    setRecentSearches([]);
  };

  const handleRecentSearchDeletePress = (id: string) => {
    setRecentSearches(recentSearches.filter((search) => search.id !== id));
  };

  const handleSearchChange = (text: string) => {
    setQuery(text);
  };

  const handleSearchClearPress = () => {
    setQuery("");
  };

  console.log(data?.searchResult3, searchData);
  return (
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
        <Box className="px-6">
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
      estimatedItemSize={70}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={() => (
        <>
          <Box className="bg-primary-600 px-6 py-6 mb-6">
            <SafeAreaView>
              <HStack className="items-center">
                <FadeOutScaleDown
                  className="mr-4"
                  onPress={() => router.back()}
                >
                  <ArrowLeft size={24} color="white" />
                </FadeOutScaleDown>
                <Input className="flex-1 border-0">
                  <InputField
                    autoFocus
                    className="text-white text-xl"
                    placeholder="What do you want to listen to ?"
                    placeholderTextColor={themeConfig.theme.colors.primary[50]}
                    type="text"
                    defaultValue={query}
                    onChangeText={handleSearchChange}
                    enterKeyHint="search"
                  />
                  <InputSlot className="pr-3" onPress={handleSearchClearPress}>
                    <InputIcon as={X} size="xl" />
                  </InputSlot>
                </Input>
              </HStack>
            </SafeAreaView>
          </Box>
          {query.length === 0 && (
            <Heading className="text-white ml-6 mb-6">Recent searches</Heading>
          )}
        </>
      )}
      ListFooterComponent={() => (
        <>
          {query.length === 0 &&
            (recentSearches.length > 0 ? (
              <Center className="my-6">
                <FadeOutScaleDown>
                  <Button
                    variant="outline"
                    action="default"
                    className="rounded-full border-white"
                    onPress={handleClearAllPress}
                  >
                    <ButtonText className="text-white">Clear all</ButtonText>
                  </Button>
                </FadeOutScaleDown>
              </Center>
            ) : (
              <EmptyDisplay />
            ))}
        </>
      )}
    />
  );
}
