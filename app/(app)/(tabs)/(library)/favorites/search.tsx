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
import { useStarred2 } from "@/hooks/openSubsonic/useLists";
import type { Child } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import { loadingData } from "@/utils/loadingData";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useForm, useStore } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import type { FuseResult } from "fuse.js";
import Fuse from "fuse.js";
import { ArrowLeft, X } from "lucide-react-native";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function FavoritesSearch() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const sort = useApp((store) => store.favoritesSort);
  const { data: starredData, isLoading, error } = useStarred2({});
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
    if (!starredData || !starredData?.starred2 || !starredData.starred2.song) {
      return null;
    }

    let newData = [...starredData.starred2.song];

    if (sort === "addedAtDesc") {
      newData = newData.reverse();
    }
    if (sort === "alphabeticalAsc") {
      newData = newData.sort((a, b) => {
        return (a?.sortName || a.title).localeCompare(b?.sortName || b.title);
      });
    }
    if (sort === "alphabeticalDesc") {
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
    const fuse = new Fuse<Child>(starredData.starred2.song, options);
    const result = fuse.search(query);
    return result;
  }, [starredData, query, sort]);

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
                    placeholder={t("app.favorites.searchPlaceholder")}
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
