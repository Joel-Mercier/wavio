import ErrorDisplay from "@/components/ErrorDisplay";
import AlbumListItem from "@/components/albums/AlbumListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Pressable } from "@/components/ui/pressable";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useAlbumList2 } from "@/hooks/openSubsonic/useLists";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import Animated from "react-native-reanimated";

export default function GenreScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error } = useAlbumList2({
    type: "byGenre",
    genre: id,
  });
  return (
    <Box className="h-full">
      <FlashList
        data={data?.albumList2.album}
        renderItem={({ item, index }: { item: AlbumID3; index: number }) => (
          <AlbumListItem album={item} index={index} />
        )}
        estimatedItemSize={70}
        ListHeaderComponent={() => (
          <>
            <LinearGradient
              colors={[themeConfig.theme.colors.blue[500], "#000000"]}
              className="h-48"
            >
              <Box className="bg-black/25 flex-1">
                <SafeAreaView>
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
                    <Heading numberOfLines={2} className="text-white" size="xl">
                      {id}
                    </Heading>
                  </VStack>
                  {error && <ErrorDisplay error={error} />}
                  {isLoading && <Spinner size="large" />}
                </SafeAreaView>
              </Box>
            </LinearGradient>
          </>
        )}
      />
    </Box>
  );
}
