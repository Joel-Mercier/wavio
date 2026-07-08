import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Box } from "@/components/ui/box";
import { useInfiniteAlbumList2 } from "@/hooks/backend/useLists";
import { useAlbumScreenLayout } from "@/hooks/useAlbumScreenLayout";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { AlbumListType } from "@/services/openSubsonic/lists";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { gridColumnCount } from "@/utils/grid";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";
import AlbumLayoutToggle from "../albums/AlbumLayoutToggle";
import AlbumListItem from "../albums/AlbumListItem";
import AlbumListItemSkeleton from "../albums/AlbumListItemSkeleton";
import EmptyDisplay from "../EmptyDisplay";
import ErrorDisplay from "../ErrorDisplay";
import FadeOutScaleDown from "../FadeOutScaleDown";
import { Heading } from "../ui/heading";
import { HStack } from "../ui/hstack";

export default function HomeSectionDetail() {
  const { t } = useTranslation();
  const screenBottomPadding = useScreenBottomPadding();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { type } = useLocalSearchParams<{ type: AlbumListType }>();
  const { width } = useWindowDimensions();
  const { layout, toggle } = useAlbumScreenLayout(`home-section:${type}`);
  const gridColumns =
    layout === "grid"
      ? gridColumnCount(width, {
          minItemWidth: 160,
          minColumns: 3,
          maxColumns: 5,
        })
      : 1;
  const musicFolderId = useCurrentMusicFolderId();
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteAlbumList2({
    type,
    size: 12,
    musicFolderId,
  });
  const albums = useMemo(
    () => data?.pages.flatMap((page) => page.albumList2?.album ?? []) ?? [],
    [data],
  );
  return (
    <Box className={cn("pb-6 h-full", isWideLayout ? "mb-6" : "mt-6")}>
      <HStack
        className="px-6 items-center mb-6 justify-between"
        style={{ paddingTop: insets.top }}
      >
        <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
          <ArrowLeft size={24} color="white" />
        </FadeOutScaleDown>
        <Heading className="text-white text-center truncate flex-1" size="lg">
          {t(`app.home.sections.${type}`)}
        </Heading>
        <AlbumLayoutToggle layout={layout} onPress={toggle} />
      </HStack>
      {error && <ErrorDisplay error={error} />}
      {!error && (
        <FlashList
          key={`home-section-${layout}-${gridColumns}`}
          data={isLoading ? loadingData(12) : albums}
          numColumns={gridColumns}
          extraData={layout}
          renderItem={({ item, index }: { item: AlbumID3; index: number }) =>
            isLoading ? (
              <AlbumListItemSkeleton
                index={index}
                layout={layout === "grid" ? "grid" : "vertical"}
              />
            ) : layout === "grid" ? (
              <AlbumListItem album={item} index={index} layout="grid" />
            ) : (
              <Box className="bg-black">
                <AlbumListItem album={item} index={index} />
              </Box>
            )
          }
          ListEmptyComponent={() => <EmptyDisplay />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingBottom: screenBottomPadding,
            paddingHorizontal: layout === "grid" ? 16 : 0,
          }}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
        />
      )}
    </Box>
  );
}
