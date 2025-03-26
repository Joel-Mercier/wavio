import ErrorDisplay from "@/components/ErrorDisplay";
import TrackListItem from "@/components/tracks/TrackListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Pressable } from "@/components/ui/pressable";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import { usePlaylist } from "@/hooks/openSubsonic/usePlaylists";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import type { Child } from "@/services/openSubsonic/types";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Clock,
  EllipsisVertical,
  ListMusic,
  Play,
  Share,
  Shuffle,
} from "lucide-react-native";
import { useCallback, useRef } from "react";
import Animated from "react-native-reanimated";

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const { data, isLoading, error } = usePlaylist(id);
  const cover = useGetCoverArt(data?.playlist.coverArt, { size: 400 });

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);
  return (
    <Box>
      <SafeAreaView className="h-full">
        <FlashList
          data={data?.playlist.entry}
          renderItem={({ item, index }: { item: Child; index: number }) => (
            <TrackListItem track={item} index={index} />
          )}
          estimatedItemSize={70}
          ListHeaderComponent={() => (
            <VStack>
              <HStack className="mt-6 items-start justify-between">
                <Pressable onPress={() => router.back()}>
                  {({ pressed }) => (
                    <Animated.View
                      className="transition duration-100"
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
                {/* https://github.com/navidrome/navidrome/issues/406 */}
                {cover.data ? (
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${cover.data}` }}
                    className="w-[70%] aspect-square rounded-md"
                    alt="Playlist cover"
                  />
                ) : (
                  <Box className="w-[70%] aspect-square rounded-md bg-primary-600 items-center justify-center">
                    <ListMusic
                      size={48}
                      color={themeConfig.theme.colors.white}
                    />
                  </Box>
                )}

                <Box className="w-6" />
              </HStack>
              <VStack>
                <VStack className="mt-5">
                  <Heading numberOfLines={1} className="text-white" size="2xl">
                    {data?.playlist.name}
                  </Heading>
                  {data?.playlist.comment && (
                    <Text className="text-md text-primary-100 mt-2">
                      {data?.playlist.comment}
                    </Text>
                  )}
                </VStack>
                <HStack className="mt-2 items-center">
                  <Clock color={"#808080"} size={16} />
                  <Text className="ml-2 text-primary-100">
                    {Math.round((data?.playlist.duration || 0) / 60)} min
                  </Text>
                </HStack>
                <HStack className="mt-4 items-center justify-between">
                  <HStack className="items-center gap-x-4">
                    <Pressable>
                      {({ pressed }) => (
                        <Animated.View
                          className="transition duration-100"
                          style={{
                            transform: [{ scale: pressed ? 0.95 : 1 }],
                            opacity: pressed ? 0.5 : 1,
                          }}
                        >
                          <Share color={themeConfig.theme.colors.white} />
                        </Animated.View>
                      )}
                    </Pressable>
                    <Pressable onPress={handlePresentModalPress}>
                      {({ pressed }) => (
                        <Animated.View
                          className="transition duration-100"
                          style={{
                            transform: [{ scale: pressed ? 0.95 : 1 }],
                            opacity: pressed ? 0.5 : 1,
                          }}
                        >
                          <EllipsisVertical
                            color={themeConfig.theme.colors.white}
                          />
                        </Animated.View>
                      )}
                    </Pressable>
                  </HStack>
                  <HStack className="items-center gap-x-4">
                    <Pressable>
                      {({ pressed }) => (
                        <Animated.View
                          className="transition duration-100"
                          style={{
                            transform: [{ scale: pressed ? 0.95 : 1 }],
                            opacity: pressed ? 0.5 : 1,
                          }}
                        >
                          <Shuffle color={themeConfig.theme.colors.white} />
                        </Animated.View>
                      )}
                    </Pressable>
                    <Pressable>
                      {({ pressed }) => (
                        <Animated.View
                          className="transition duration-100 w-12 h-12 rounded-full bg-emerald-500 items-center justify-center"
                          style={{
                            transform: [{ scale: pressed ? 0.98 : 1 }],
                            opacity: pressed ? 0.5 : 1,
                          }}
                        >
                          <Play
                            color={themeConfig.theme.colors.white}
                            fill={themeConfig.theme.colors.white}
                          />
                        </Animated.View>
                      )}
                    </Pressable>
                  </HStack>
                </HStack>
              </VStack>
              {error && <ErrorDisplay error={error} />}
              {isLoading && <Spinner size="large" />}
            </VStack>
          )}
          ListFooterComponent={() => (
            <VStack className="my-6">
              <Text className="text-white font-bold">
                {(data?.playlist.songCount || "0 ") +
                  (data?.playlist.songCount || 0 > 1 ? " song" : "songs")}{" "}
                ⦁ {Math.round((data?.playlist.duration || 0) / 60)} min
              </Text>
            </VStack>
          )}
          contentContainerStyle={{ paddingHorizontal: 24 }}
        />
      </SafeAreaView>
      <BottomSheetModal
        ref={bottomSheetModalRef}
        onChange={handleSheetPositionChange}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView
          style={{
            flex: 1,
            alignItems: "center",
          }}
        >
          <Box className="p-6 w-full pb-12">
            <HStack className="items-center">
              {cover?.data ? (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${cover.data}` }}
                  className="w-16 h-16 rounded-full aspect-square"
                  alt="Track cover"
                />
              ) : (
                <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                  <ListMusic size={24} color={themeConfig.theme.colors.white} />
                </Box>
              )}
              <VStack className="ml-4">
                <Heading
                  className="text-white font-normal"
                  size="lg"
                  numberOfLines={1}
                >
                  {data?.playlist.name}
                </Heading>
              </VStack>
            </HStack>
            <VStack className="mt-6 gap-y-8">
              <Pressable onPress={() => console.log("share pressed")}>
                {({ pressed }) => (
                  <Animated.View
                    className={`flex-row items-center transition duration-100 ${pressed ? "opacity-50" : ""}`}
                    style={{ transform: [{ scale: pressed ? 0.98 : 1 }] }}
                  >
                    <Share
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">Share</Text>
                  </Animated.View>
                )}
              </Pressable>
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
    </Box>
  );
}
