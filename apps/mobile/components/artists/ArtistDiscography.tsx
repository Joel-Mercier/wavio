import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import { Box } from "@/components/ui/box";
import { useArtist } from "@/hooks/backend/useBrowsing";
import { useAlbumScreenLayout } from "@/hooks/useAlbumScreenLayout";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import { gridColumnCount } from "@/utils/grid";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import {
  albumMatchesReleaseTypes,
  collectReleaseTypeFilters,
  translateReleaseType,
  UNTAGGED_RELEASE_TYPE,
} from "@/utils/releaseTypes";
import { cn } from "@/utils/tailwind";
import AlbumLayoutToggle from "../albums/AlbumLayoutToggle";
import AlbumListItem from "../albums/AlbumListItem";
import AlbumListItemSkeleton from "../albums/AlbumListItemSkeleton";
import FadeOutScaleDown from "../FadeOutScaleDown";
import { Badge, BadgeText } from "../ui/badge";
import { Heading } from "../ui/heading";
import { HStack } from "../ui/hstack";
import { ScrollView } from "../ui/scroll-view";

export default function ArtistDiscography() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const screenBottomPadding = useScreenBottomPadding();
  const { width } = useWindowDimensions();
  const { layout, toggle } = useAlbumScreenLayout("artist-discography");
  const gridColumns =
    layout === "grid"
      ? gridColumnCount(width, {
          minItemWidth: 160,
          minColumns: 3,
          maxColumns: 5,
        })
      : 1;
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { data, isLoading, error } = useArtist(id);
  const listRef = useRef<FlashListRef<AlbumID3>>(null);
  const [releaseTypeFilter, setReleaseTypeFilter] = useState<string[]>([]);
  const albums = data?.artist?.album;
  const filterOptions = useMemo(
    () => collectReleaseTypeFilters(albums ?? []),
    [albums],
  );
  const activeFilter = useMemo(
    () =>
      releaseTypeFilter.filter((key) =>
        filterOptions.some((option) => option.key === key),
      ),
    [releaseTypeFilter, filterOptions],
  );
  const visibleAlbums = useMemo(
    () =>
      activeFilter.length
        ? albums?.filter((album) =>
            albumMatchesReleaseTypes(album, activeFilter),
          )
        : albums,
    [albums, activeFilter],
  );
  // Toggling a badge swaps the result set; without this the list keeps its old
  // offset and shows blank space instead of the new matches. Keyed on the
  // selection's contents so a background refetch doesn't yank the scroll.
  const activeFilterKey = activeFilter.join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeFilterKey is the trigger, not a read value
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activeFilterKey]);
  const handleFilterPress = (key: string) =>
    setReleaseTypeFilter((current) =>
      current.includes(key)
        ? current.filter((selected) => selected !== key)
        : [...current, key],
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
          {name}
        </Heading>
        <AlbumLayoutToggle layout={layout} onPress={toggle} />
      </HStack>
      {filterOptions.length > 1 && (
        <Box className="relative mb-6">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="grow-0"
            contentContainerStyle={{ paddingHorizontal: 24 }}
          >
            {filterOptions.map((option, index) => (
              <FadeOutScaleDown
                key={option.key}
                onPress={() => handleFilterPress(option.key)}
              >
                <Badge
                  className={cn("rounded-full bg-primary-500 px-4 py-1", {
                    "bg-emerald-500": activeFilter.includes(option.key),
                    "mr-2": index < filterOptions.length - 1,
                  })}
                >
                  <BadgeText className="normal-case text-md text-white">
                    {option.key === UNTAGGED_RELEASE_TYPE
                      ? t("app.albums.releaseTypeUntagged")
                      : translateReleaseType(option.label, t)}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
            ))}
          </ScrollView>
          <LinearGradient
            colors={["#000000", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 24,
            }}
          />
          <LinearGradient
            colors={["transparent", "#000000"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            pointerEvents="none"
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 24,
            }}
          />
        </Box>
      )}
      {error ? (
        <ErrorDisplay error={error as Error} />
      ) : (
        <FlashList
          ref={listRef}
          key={`artist-discography-${layout}-${gridColumns}`}
          // Off by default it keeps the visible item pinned when the filtered set
          // changes above the viewport, which overrides our scroll-to-top.
          maintainVisibleContentPosition={{ disabled: true }}
          data={isLoading ? loadingData(3) : (visibleAlbums ?? [])}
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
          keyExtractor={(item, index) => `${item.id}-${index}`}
          ListEmptyComponent={() => (isLoading ? null : <EmptyDisplay />)}
          contentContainerStyle={{
            paddingBottom: screenBottomPadding,
            paddingHorizontal: layout === "grid" ? 16 : 0,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Box>
  );
}
