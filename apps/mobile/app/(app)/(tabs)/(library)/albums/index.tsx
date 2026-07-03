import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useForm, useStore } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import AlbumListItem from "@/components/albums/AlbumListItem";
import AlbumListItemSkeleton from "@/components/albums/AlbumListItemSkeleton";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { useInfiniteAlbumList2 } from "@/hooks/backend/useLists";
import { useSearch3 } from "@/hooks/backend/useSearching";
import useDebounce from "@/hooks/useDebounce";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";

export default function AllAlbumsScreen() {
  const [white, primary50, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-primary-50",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const musicFolderId = useCurrentMusicFolderId();
  const form = useForm({ defaultValues: { query: "" } });
  const query = useStore(form.store, (state) => state.values.query);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounce = useDebounce(150);
  const listRef = useRef<FlashListRef<AlbumID3>>(null);

  useEffect(() => {
    debounce(() => setDebouncedQuery(query));
  }, [query, debounce]);

  const isSearching = debouncedQuery.length > 0;

  // Editing the query swaps the result set; without this the list keeps its old
  // offset and hides the new top matches (notably when deleting characters).
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [debouncedQuery]);

  const {
    data: browseData,
    isLoading: isLoadingBrowse,
    error: browseError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteAlbumList2(
    { type: "alphabeticalByName", size: 20, musicFolderId },
    { enabled: !isSearching },
  );
  const {
    data: searchData,
    isLoading: isLoadingSearch,
    error: searchError,
  } = useSearch3(debouncedQuery, {
    albumCount: 100,
    albumOffset: 0,
    artistCount: 0,
    songCount: 0,
    musicFolderId,
  });

  const browseAlbums = useMemo(
    () =>
      browseData?.pages.flatMap((page) => page.albumList2?.album ?? []) ?? [],
    [browseData],
  );
  const albums = isSearching
    ? (searchData?.searchResult3?.album ?? [])
    : browseAlbums;
  const isLoading = isSearching ? isLoadingSearch : isLoadingBrowse;
  const error = isSearching ? searchError : browseError;

  const handleSearchClearPress = () => {
    form.setFieldValue("query", "");
  };

  return (
    <Box className="h-full flex-1">
      <Box
        className="bg-primary-600 px-6 py-6 mb-6"
        style={{ paddingTop: insets.top + 24 }}
      >
        <HStack className="items-center mb-4">
          <FadeOutScaleDown
            className="mr-4"
            onPress={() => goBackOrHome(router)}
          >
            <ArrowLeft size={24} color={white} />
          </FadeOutScaleDown>
          <Heading className="text-white" size="xl">
            {t("app.library.allAlbums")}
          </Heading>
        </HStack>
        <form.Field name="query">
          {(field) => (
            <Input className="border-0">
              <InputSlot className="pl-3">
                <InputIcon as={Search} />
              </InputSlot>
              <InputField
                disableFullscreenUI
                className="text-white text-lg"
                placeholder={t("app.library.search.inputPlaceholder")}
                placeholderTextColor={primary50}
                type="text"
                value={field.state.value}
                onChangeText={field.handleChange}
                onBlur={field.handleBlur}
                enterKeyHint="search"
              />
              {query ? (
                <InputSlot className="pr-3" onPress={handleSearchClearPress}>
                  <InputIcon as={X} />
                </InputSlot>
              ) : null}
            </Input>
          )}
        </form.Field>
      </Box>
      {error && <ErrorDisplay error={error as Error} />}
      {!error && (
        <FlashList
          ref={listRef}
          // Off by default it keeps the visible item pinned when the filtered
          // set changes above the viewport, which hides the new top matches on
          // query edits and overrides our scroll-to-top. We only ever append
          // (pagination), so position preservation isn't needed here.
          maintainVisibleContentPosition={{ disabled: true }}
          data={isLoading ? loadingData(12) : albums}
          keyExtractor={(item, index) =>
            isLoading ? `skeleton-${index}` : (item as AlbumID3).id
          }
          renderItem={({ item, index }: { item: AlbumID3; index: number }) =>
            isLoading ? (
              <AlbumListItemSkeleton index={index} />
            ) : (
              <AlbumListItem album={item} index={index} />
            )
          }
          ListEmptyComponent={() =>
            isLoading ? null : isSearching && !debouncedQuery ? null : (
              <EmptyDisplay />
            )
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <Box className="py-6">
                <ActivityIndicator color={emerald500} />
              </Box>
            ) : null
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: screenBottomPadding,
          }}
          onEndReached={() => {
            if (!isSearching && hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
        />
      )}
    </Box>
  );
}
