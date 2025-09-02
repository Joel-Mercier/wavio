import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import GenreListItem from "@/components/search/GenreListItem";
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { themeConfig } from "@/config/theme";
import { useGenres } from "@/hooks/openSubsonic/useBrowsing";
import type { Genre } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import { cn } from "@/utils/tailwind";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { Search } from "lucide-react-native";

export default function SearchScreen() {
  const setShowDrawer = useApp.use.setShowDrawer();
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const { data, isLoading, error } = useGenres();

  const handleSearchPress = () => {
    router.navigate("/(tabs)/(search)/recent-searches");
  };
  return (
    <Box>
      <SafeAreaView className="h-full">
        <FlashList
          data={data?.genres.genre}
          renderItem={({ item, index }: { item: Genre; index: number }) => (
            <Box
              className={cn("flex-1 w-full mb-4", {
                "mr-2": index % 2 === 0,
                "ml-2": index % 2 !== 0,
              })}
            >
              <GenreListItem genre={item} />
            </Box>
          )}
          numColumns={2}
          ListHeaderComponent={() => (
            <>
              <HStack className="gap-x-4 my-6 items-center">
                <FadeOutScaleDown onPress={() => setShowDrawer(true)}>
                  <Avatar size="sm" className="border-emerald-500 border-2">
                    <AvatarFallbackText className="font-body ">
                      {process.env.EXPO_PUBLIC_NAVIDROME_USERNAME || ""}
                    </AvatarFallbackText>
                  </Avatar>
                </FadeOutScaleDown>
                <Heading className="text-white" size="2xl">
                  Search
                </Heading>
              </HStack>
              <FadeOutScaleDown className="mb-6" onPress={handleSearchPress}>
                <HStack className="bg-white rounded-md py-3 px-3">
                  <Search
                    size={22}
                    color={themeConfig.theme.colors.gray[500]}
                  />
                  <Text className="text-gray-500 text-xl ml-4">
                    What do you want to listen to ?
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <Heading size="lg" className="text-white mb-4">
                Explore genres
              </Heading>
              {isLoading && <Spinner size="large" />}
              {error && <ErrorDisplay error={error} />}
            </>
          )}
          ListEmptyComponent={() => <EmptyDisplay />}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: tabBarHeight,
          }}
        />
      </SafeAreaView>
    </Box>
  );
}
