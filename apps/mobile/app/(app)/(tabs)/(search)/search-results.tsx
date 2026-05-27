import { FlashList } from "@shopify/flash-list";
import { useForm } from "@tanstack/react-form";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import SearchResultListItem from "@/components/search/SearchResultListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { ScrollView } from "@/components/ui/scroll-view";
import { useSearch3 } from "@/hooks/backend/useSearching";
import type { AlbumID3, ArtistID3, Child } from "@/services/openSubsonic/types";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { loadingData } from "@/utils/loadingData";
import { cn } from "@/utils/tailwind";

export default function SearchResultsScreen() {
  const [primary50] = Uniwind.getCSSVariable([
    "--color-primary-50",
  ]) as string[];
  const { t } = useTranslation();
  const { query } = useLocalSearchParams<{ query: string }>();
  const [filter, setFilter] = useState<
    "artists" | "albums" | "playlists" | "songs" | null
  >(null);
  const bottomTabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
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
      searchData.push(...data.searchResult3.album);
    }
    if ((!filter || filter === "artists") && data?.searchResult3?.artist) {
      searchData.push(...data.searchResult3.artist);
    }
    if ((!filter || filter === "songs") && data?.searchResult3?.song) {
      searchData.push(...data.searchResult3.song);
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
    <Box className="h-full flex-1">
      <Box
        className="bg-primary-600 px-6 py-6 mb-6"
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
                  className="text-white text-xl"
                  placeholder={t("app.search.inputPlaceholder")}
                  placeholderTextColor={primary50}
                  type="text"
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  onBlur={field.handleBlur}
                  enterKeyHint="search"
                />
                <InputSlot className="pr-3" onPress={handleSearchClearPress}>
                  <InputIcon as={X} size="xl" />
                </InputSlot>
              </Input>
            )}
          </form.Field>
        </HStack>
      </Box>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="grow-0 px-6 mb-6"
      >
        <FadeOutScaleDown onPress={() => handleFilterPress("albums")}>
          <Badge
            className={cn("rounded-full bg-gray-800 px-4 py-1 mr-2", {
              "bg-emerald-500 text-primary-800": filter === "albums",
            })}
          >
            <BadgeText className="normal-case text-md text-white">
              {t("app.shared.album_other")}
            </BadgeText>
          </Badge>
        </FadeOutScaleDown>
        <FadeOutScaleDown onPress={() => handleFilterPress("artists")}>
          <Badge
            className={cn("rounded-full bg-gray-800 px-4 py-1 mr-2", {
              "bg-emerald-500 text-primary-800": filter === "artists",
            })}
          >
            <BadgeText className="normal-case text-md text-white">
              {t("app.shared.artist_other")}
            </BadgeText>
          </Badge>
        </FadeOutScaleDown>
        <FadeOutScaleDown onPress={() => handleFilterPress("songs")}>
          <Badge
            className={cn("rounded-full bg-gray-800 px-4 py-1 mr-2", {
              "bg-emerald-500 text-primary-800": filter === "songs",
            })}
          >
            <BadgeText className="normal-case text-md text-white">
              {t("app.shared.song_other")}
            </BadgeText>
          </Badge>
        </FadeOutScaleDown>
      </ScrollView>
      {error && <ErrorDisplay error={error} />}
      {!error && (
        <FlashList
          data={
            (isLoading ? loadingData(12) : searchData) as Array<
              AlbumID3 | Child | ArtistID3
            >
          }
          keyExtractor={(item, index) =>
            isLoading ? `skeleton-${index}` : item.id
          }
          renderItem={({
            item,
            index,
          }: {
            item: AlbumID3 | Child | ArtistID3;
            index: number;
          }) =>
            isLoading ? (
              <TrackListItemSkeleton index={index} className="px-6" />
            ) : (
              <Box className="px-6">
                <SearchResultListItem
                  searchResult={item as AlbumID3 & Child & ArtistID3}
                />
              </Box>
            )
          }
          ListEmptyComponent={isLoading ? null : <EmptyDisplay />}
          contentContainerStyle={{
            paddingBottom:
              insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Box>
  );
}
