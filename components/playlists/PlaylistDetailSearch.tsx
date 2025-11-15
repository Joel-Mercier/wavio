import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { themeConfig } from "@/config/theme";
import { usePlaylist } from "@/hooks/openSubsonic/usePlaylists";
import type { Child } from "@/services/openSubsonic/types";
import usePlaylists from "@/stores/playlists";
import { loadingData } from "@/utils/loadingData";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useForm, useStore } from "@tanstack/react-form";
import { useLocalSearchParams, useRouter } from "expo-router";
import Fuse, { type FuseResult } from "fuse.js";
import { ArrowLeft, X } from "lucide-react-native";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function PlaylistDetailSearch() {
  const { id } = useLocalSearchParams<{
    id: string;
  }>();
  const playlistSorts = usePlaylists((store) => store.playlistSorts);
  const sort = playlistSorts[id] ?? "addedAtAsc";
  const getPlaylistTrackPositions = usePlaylists(
    (store) => store.getPlaylistTrackPositions,
  );
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { data: playlistData, isLoading, error } = usePlaylist(id);
  const form = useForm({
    defaultValues: {
      query: "",
    },
  });
  const query = useStore(form.store, (state) => state.values.query);
  const handleSearchClearPress = () => {
    form.setFieldValue("query", "");
  };

  const data = useMemo(() => {
    if (
      !playlistData ||
      !playlistData?.playlist ||
      !playlistData?.playlist.entry
    ) {
      return null;
    }
    let newData = [...playlistData.playlist.entry];
    const storedPositions = getPlaylistTrackPositions(id);

    // If we have stored positions and sort is "addedAtAsc", use stored order
    if (storedPositions && sort === "addedAtAsc") {
      newData = newData.sort((a, b) => {
        const posA = storedPositions[a.id];
        const posB = storedPositions[b.id];
        // If both have positions, sort by position
        if (posA !== undefined && posB !== undefined) {
          return posA - posB;
        }
        // If only one has position, prioritize it
        if (posA !== undefined) return -1;
        if (posB !== undefined) return 1;
        // If neither has position, maintain original order
        return 0;
      });
    } else if (sort === "addedAtDesc") {
      newData = newData.reverse();
    } else if (sort === "alphabeticalAsc") {
      newData = newData.sort((a, b) => {
        return (a?.sortName || a.title).localeCompare(b?.sortName || b.title);
      });
    } else if (sort === "alphabeticalDesc") {
      newData = newData.sort((a, b) => {
        return (b?.sortName || b.title).localeCompare(a?.sortName || a.title);
      });
    }

    if (query.length === 0) {
      const result = newData.map((item, refIndex) => ({
        item,
        refIndex,
        matches: [],
        score: 0,
      }));
      return result;
    }

    const options = {
      includeScore: true,
      ignoreDiacritics: true,
      keys: ["title"],
    };
    const fuse = new Fuse<Child>(newData, options);
    const result = fuse.search(query);
    return result;
  }, [playlistData, sort, query, id, getPlaylistTrackPositions]);

  return (
    <Box className="h-full">
      <Box className="bg-primary-600 px-6 py-6">
        <Box style={{ paddingTop: insets.top }}>
          <HStack className="items-center">
            <FadeOutScaleDown className="mr-4" onPress={() => router.back()}>
              <ArrowLeft size={24} color="white" />
            </FadeOutScaleDown>
            <form.Field name="query">
              {(field) => (
                <Input className="flex-1 border-0">
                  <InputField
                    className="text-white text-xl"
                    placeholder={t("app.playlists.searchPlaceholder")}
                    placeholderTextColor={themeConfig.theme.colors.primary[50]}
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
                </Input>
              )}
            </form.Field>
          </HStack>
        </Box>
      </Box>
      <FlashList
        data={data || loadingData(6)}
        keyExtractor={(item) => item.item?.id}
        renderItem={({
          item,
          index,
        }: {
          item: FuseResult<Child>;
          index: number;
        }) => (
          <Box className="px-6">
            {isLoading ? (
              <TrackListItemSkeleton index={index} />
            ) : (
              <TrackListItem track={item.item} index={index} />
            )}
          </Box>
        )}
        ListEmptyComponent={<EmptyDisplay />}
        ListHeaderComponent={error && <ErrorDisplay error={error} />}
        contentContainerStyle={{
          paddingBottom: tabBarHeight + FLOATING_PLAYER_HEIGHT,
        }}
        showsVerticalScrollIndicator={false}
      />
    </Box>
  );
}
