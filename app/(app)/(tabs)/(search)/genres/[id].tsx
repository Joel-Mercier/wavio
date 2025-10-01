import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import AlbumListItem from "@/components/albums/AlbumListItem";
import AlbumListItemSkeleton from "@/components/albums/AlbumListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useAlbumList2 } from "@/hooks/openSubsonic/useLists";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { loadingData } from "@/utils/loadingData";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);
const AnimatedBox = Animated.createAnimatedComponent(Box);

export default function GenreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
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
  const { data, isLoading, error } = useAlbumList2({
    type: "byGenre",
    genre: id,
  });
  return (
    <Box className="h-full">
      <AnimatedBox
        className="w-full z-10 absolute top-0 left-0 right-0"
        style={[headerStyle]}
      >
        <LinearGradient
          colors={["#000", themeConfig.theme.colors.blue[500]]}
          locations={[0, 0.7]}
        >
          <HStack
            className="items-center justify-between pb-4 px-6 bg-black/25"
            style={{ paddingTop: insets.top + 16 }}
          >
            <FadeOutScaleDown onPress={() => router.back()}>
              <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                <ArrowLeft size={24} color={themeConfig.theme.colors.white} />
              </Box>
            </FadeOutScaleDown>
            <Heading className="text-white font-bold" size="lg">
              {id}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </AnimatedBox>
      <AnimatedFlashList
        onScroll={scrollHandler}
        data={data?.albumList2.album || loadingData(6)}
        renderItem={({ item, index }: { item: AlbumID3; index: number }) =>
          isLoading ? (
            <AlbumListItemSkeleton index={index} />
          ) : (
            <AlbumListItem album={item} index={index} />
          )
        }
        ListHeaderComponent={() => (
          <>
            <LinearGradient
              colors={[themeConfig.theme.colors.blue[500], "#000000"]}
              className="h-48"
            >
              <Box
                className="bg-black/25 flex-1"
                style={{ paddingTop: insets.top }}
              >
                <VStack className="mt-6 px-6 items-start justify-between h-full -mb-12">
                  <Pressable onPress={() => router.back()}>
                    {({ pressed }) => (
                      <Animated.View
                        className="transition duration-100 w-10 h-10 rounded-full bg-black/40 items-center justify-center"
                        style={{
                          transform: [{ scale: pressed ? 0.95 : 1 }],
                          opacity: pressed ? 0.5 : 1,
                        }}
                      >
                        <ArrowLeft
                          size={24}
                          color={themeConfig.theme.colors.white}
                        />
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
          </>
        )}
        ListEmptyComponent={() => <EmptyDisplay />}
        contentContainerStyle={{
          paddingBottom: bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
        }}
      />
    </Box>
  );
}
