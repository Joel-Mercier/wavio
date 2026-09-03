import { FlashList } from "@shopify/flash-list";
import { useForm, useSelector } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import type { FuseResult } from "fuse.js";
import Fuse from "fuse.js";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardController } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { useStarred2 } from "@/hooks/backend/useLists";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import { useTrackSort } from "@/hooks/useTrackSort";
import type { Child } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import { sortItems } from "@/utils/sort";
import { TRACK_SORT_SPECS } from "@/utils/trackSort";

export default function FavoritesSearch() {
  const [primary50] = Uniwind.getCSSVariable([
    "--color-primary-50",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const sort = useApp((store) => store.favoritesSort);
  const musicFolderId = useCurrentMusicFolderId();
  const {
    data: starredData,
    isLoading,
    error,
  } = useStarred2({ musicFolderId });
  const { activeSort } = useTrackSort(starredData?.starred2?.song, sort);
  const form = useForm({
    defaultValues: {
      query: "",
    },
  });
  const query = useSelector(form.store, (state) => state.values.query);
  const handleSearchClearPress = () => {
    form.setFieldValue("query", "");
  };

  const data = useMemo(() => {
    if (!starredData || !starredData?.starred2 || !starredData.starred2.song) {
      return null;
    }

    // Same ordering as the favorites screen, so results keep the sort picked there.
    const newData = sortItems(
      starredData.starred2.song,
      activeSort,
      TRACK_SORT_SPECS,
    );

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
  }, [starredData, query, activeSort]);

  const trackList = useMemo(() => data?.map((r) => r.item), [data]);
  const playTrack = useTrackListPress(trackList);
  // Picking a result ends the search, so drop the keyboard: while the IME is up
  // it swallows the Android back press and the screen looks stuck.
  const handleTrackPress = useCallback(
    (index: number, track: Child) => {
      KeyboardController.dismiss();
      playTrack(index, track);
    },
    [playTrack],
  );

  return (
    <Box className="h-full">
      <Box className="bg-primary-600 px-6 py-6">
        <Box style={{ paddingTop: insets.top }}>
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
                    className="text-white text-xl"
                    placeholder={t("app.favorites.searchPlaceholder")}
                    placeholderTextColor={primary50}
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
        data={isLoading ? loadingData(6) : (data ?? [])}
        keyExtractor={(item, index) =>
          isLoading ? `skeleton-${index}` : item.item.id
        }
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
              <TrackListItem
                track={item.item}
                index={index}
                onPress={handleTrackPress}
              />
            )}
          </Box>
        )}
        ListEmptyComponent={<EmptyDisplay />}
        ListHeaderComponent={error && <ErrorDisplay error={error} />}
        contentContainerStyle={{
          paddingBottom: screenBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      />
    </Box>
  );
}
