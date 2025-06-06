import EmptyDisplay from "@/components/EmptyDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SearchResultListItem from "@/components/search/SearchResultListItem";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { themeConfig } from "@/config/theme";
import { useSearch3 } from "@/hooks/openSubsonic/useSearching";
import type { AlbumID3, ArtistID3, Child } from "@/services/openSubsonic/types";
import { cn } from "@/utils/tailwind";
import { FlashList } from "@shopify/flash-list";
import { useForm } from "@tanstack/react-form";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, X } from "lucide-react-native";
import { useMemo, useState } from "react";

export default function SearchResultsScreen() {
  const { query } = useLocalSearchParams<{ query: string }>();
  const [filter, setFilter] = useState<
    "artists" | "albums" | "playlists" | "songs" | null
  >(null);
  const { data, isLoading, error } = useSearch3(query, {
    albumCount: 12,
    albumOffset: 0,
    songCount: 12,
    songOffset: 0,
    artistCount: 12,
    artistOffset: 0,
  });
  const router = useRouter();
  const form = useForm({
    defaultValues: {
      query,
    },
  });

  const searchData = useMemo(() => {
    if (!data || !data?.searchResult3) {
      return [];
    }

    const searchData = [];
    if ((!filter || filter === "albums") && data?.searchResult3?.album) {
      searchData.push(...data?.searchResult3?.album);
    }
    if ((!filter || filter === "artists") && data?.searchResult3?.artist) {
      searchData.push(...data?.searchResult3?.artist);
    }
    if ((!filter || filter === "songs") && data?.searchResult3?.song) {
      searchData.push(...data?.searchResult3?.song);
    }
    return searchData;
  }, [data, filter]);

  const handleSearchClearPress = () => {
    router.navigate("/recent-searches");
  };

  const handleFilterPress = (
    type: "artists" | "albums" | "playlists" | "songs",
  ) => {
    setFilter(type === filter ? null : type);
  };

  return (
    <SafeAreaView className="h-full" edges={["bottom", "left", "right"]}>
      <FlashList
        data={searchData}
        keyExtractor={(item) => item.id}
        renderItem={({
          item,
          index,
        }: { item: AlbumID3 & Child & ArtistID3; index: number }) => (
          <Box className="px-6">
            <SearchResultListItem searchResult={item} />
          </Box>
        )}
        estimatedItemSize={70}
        contentInsetAdjustmentBehavior="automatic"
        ListEmptyComponent={<EmptyDisplay />}
        ListHeaderComponent={
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
                  <form.Field name="query">
                    {(field) => (
                      <Input className="flex-1 border-0">
                        <InputField
                          className="text-white text-xl"
                          placeholder="What do you want to listen to ?"
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
            <SafeAreaView edges={["bottom", "left", "right"]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="gap-x-4 mb-6"
              >
                <FadeOutScaleDown onPress={() => handleFilterPress("albums")}>
                  <Badge
                    className={cn("rounded-full bg-gray-800 px-4 py-1 mr-2", {
                      "bg-emerald-500 text-primary-800": filter === "albums",
                    })}
                  >
                    <BadgeText className="normal-case text-md text-white">
                      Albums
                    </BadgeText>
                  </Badge>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={() => handleFilterPress("artists")}>
                  <Badge
                    className={cn("rounded-full bg-gray-800 px-4 py-1", {
                      "bg-emerald-500 text-primary-800": filter === "artists",
                    })}
                  >
                    <BadgeText className="normal-case text-md text-white">
                      Artists
                    </BadgeText>
                  </Badge>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={() => handleFilterPress("songs")}>
                  <Badge
                    className={cn("rounded-full bg-gray-800 px-4 py-1", {
                      "bg-emerald-500 text-primary-800": filter === "songs",
                    })}
                  >
                    <BadgeText className="normal-case text-md text-white">
                      Songs
                    </BadgeText>
                  </Badge>
                </FadeOutScaleDown>
              </ScrollView>
            </SafeAreaView>
          </>
        }
      />
    </SafeAreaView>
  );
}
