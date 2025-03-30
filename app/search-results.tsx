import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import RecentSearchListItem from "@/components/search/RecentSearchListItem";
import { Box } from "@/components/ui/box";
import useRecentSearches, { type RecentSearch } from "@/stores/recentSearches";
import { Header } from "@react-navigation/elements";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useRef } from "react";

export default function SearchResultsScreen() {
  const router = useRouter();
  const searchInput = useRef<any>(null);
  const recentSearches = useRecentSearches.use.recentSearches();
  return (
    <FlashList
      data={recentSearches}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }: { item: RecentSearch; index: number }) => (
        <Box className="px-6">
          <RecentSearchListItem recentSearch={item} />
        </Box>
      )}
      estimatedItemSize={70}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={() => (
        <Header
          title=""
          headerSearchBarOptions={{
            placeholder: "What do you want to listen to ?",
            autoFocus: true,
            inputType: "text",
            ref: searchInput,
          }}
          headerLeft={() => (
            <FadeOutScaleDown className="ml-6" onPress={() => router.back()}>
              <ArrowLeft size={24} color="white" />
            </FadeOutScaleDown>
          )}
        />
      )}
    />
  );
}
