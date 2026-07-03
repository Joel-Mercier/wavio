import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import { useMemo } from "react";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
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
import { Pressable } from "@/components/ui/pressable";
import { VStack } from "@/components/ui/vstack";
import { useInfiniteAlbumList2 } from "@/hooks/backend/useLists";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;
const AnimatedBox = Animated.createAnimatedComponent(Box);

export default function GenreScreen() {
  const [blue500, white] = Uniwind.getCSSVariable([
    "--color-blue-500",
    "--color-white",
  ]) as string[];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const offsetY = useSharedValue(0);
  const headerStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(offsetY.value, [0, 50], [0, 1], Extrapolation.CLAMP),
    };
  });
  const scrollHandler = useAnimatedScrollHandler((event) => {
    offsetY.value = event.contentOffset.y;
  });
  const { id } = useLocalSearchParams<{ id: string }>();
  const musicFolderId = useCurrentMusicFolderId();
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteAlbumList2({
    type: "byGenre",
    genre: id,
    size: 12,
    musicFolderId,
  });
  const albums = useMemo(
    () => data?.pages.flatMap((page) => page.albumList2?.album ?? []) ?? [],
    [data],
  );
  return (
    <Box className="h-full">
      <AnimatedBox
        className="w-full z-10 absolute top-0 left-0 right-0"
        style={[headerStyle]}
      >
        <LinearGradient colors={[blue500, "#000"]} locations={[0, 0.7]}>
          <HStack
            className="items-center justify-between pb-4 px-6 bg-black/25"
            style={{ paddingTop: insets.top + 16 }}
          >
            <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
              <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                <ArrowLeft size={24} color={white} />
              </Box>
            </FadeOutScaleDown>
            <Heading
              numberOfLines={1}
              className="text-white font-bold text-center truncate flex-1"
              size="lg"
            >
              {id}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </AnimatedBox>
      <AnimatedFlashList
        onScroll={scrollHandler}
        data={isLoading ? loadingData(12) : albums}
        renderItem={({ item, index }: { item: AlbumID3; index: number }) =>
          isLoading ? (
            <AlbumListItemSkeleton index={index} />
          ) : (
            <AlbumListItem album={item} index={index} />
          )
        }
        ListHeaderComponent={
          <LinearGradient
            colors={[blue500, "#000000"]}
            className="h-48"
            style={{ height: 192 }}
          >
            <Box
              className="bg-black/25 flex-1"
              style={{ paddingTop: insets.top }}
            >
              <VStack className="mt-6 px-6 items-start justify-between h-full -mb-12">
                <Pressable onPress={() => goBackOrHome(router)}>
                  {({ pressed }) => (
                    <Animated.View
                      className="transition duration-100 w-10 h-10 rounded-full bg-black/40 items-center justify-center"
                      style={{
                        transform: [{ scale: pressed ? 0.95 : 1 }],
                        opacity: pressed ? 0.5 : 1,
                      }}
                    >
                      <ArrowLeft size={24} color={white} />
                    </Animated.View>
                  )}
                </Pressable>
                <Heading
                  numberOfLines={2}
                  className="text-white mb-12"
                  size="xl"
                >
                  {id}
                </Heading>
              </VStack>
              {error && <ErrorDisplay error={error} />}
            </Box>
          </LinearGradient>
        }
        ListEmptyComponent={<EmptyDisplay />}
        contentContainerStyle={{
          paddingBottom: screenBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
      />
    </Box>
  );
}
