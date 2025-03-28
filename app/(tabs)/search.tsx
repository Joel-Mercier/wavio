import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import GenreListItem from "@/components/search/GenreListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { themeConfig } from "@/config/theme";
import { useGenres } from "@/hooks/openSubsonic/useBrowsing";
import type { Genre } from "@/services/openSubsonic/types";
import { cn } from "@/utils/tailwind";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { Search } from "lucide-react-native";

export default function SearchScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const { data, isLoading, error } = useGenres();
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
          estimatedItemSize={98}
          ListHeaderComponent={() => (
            <>
              <HStack className="my-6 items-center justify-between">
                <Heading className="text-white" size="2xl">
                  Search
                </Heading>
              </HStack>
              <FadeOutScaleDown className="mb-6">
                <Input
                  size="xl"
                  isReadOnly
                  className="bg-white rounded-md border-0"
                >
                  <InputSlot className="pl-3">
                    <InputIcon
                      as={Search}
                      color={themeConfig.theme.colors.black}
                    />
                  </InputSlot>
                  <InputField placeholder="What do you want to listen to ?" />
                </Input>
              </FadeOutScaleDown>
              <Heading size="lg" className="text-white mb-4">
                Explore genres
              </Heading>
              {isLoading && <Spinner size="large" />}
              {error && <ErrorDisplay error={error} />}
            </>
          )}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: tabBarHeight,
          }}
        />
      </SafeAreaView>
    </Box>
  );
}
