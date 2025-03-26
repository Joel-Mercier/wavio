import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import AlbumListItem from "@/components/albums/AlbumListItem";
import TrackListItem from "@/components/tracks/TrackListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { ImageBackground } from "@/components/ui/image-background";
import { Pressable } from "@/components/ui/pressable";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useArtist, useTopSongs } from "@/hooks/openSubsonic/useBrowsing";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  EllipsisVertical,
  Heart,
  Play,
  Share,
  Shuffle,
  User,
} from "lucide-react-native";
import { useCallback, useRef } from "react";
import Animated from "react-native-reanimated";

export default function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const { data, isLoading, error } = useArtist(id);
  const cover = useGetCoverArt(data?.artist.coverArt, { size: 400 });
  const {
    data: topSongsData,
    isLoading: isLoadingTopSongs,
    error: topSongsError,
  } = useTopSongs(data?.artist.name, { count: 10 });

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  return (
    <Box className="h-full">
      <FlashList
        data={data?.artist.album}
        renderItem={({ item, index }: { item: AlbumID3; index: number }) => (
          <AlbumListItem album={item} index={index} />
        )}
        keyExtractor={(item) => item.id}
        estimatedItemSize={70}
        ListHeaderComponent={() => (
          <>
            <ImageBackground
              source={{ uri: `data:image/jpeg;base64,${cover?.data}` }}
              alt="Artist cover"
              className="h-96"
              resizeMode="cover"
            >
              <LinearGradient
                colors={["transparent", "#000000"]}
                className="h-96"
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
                      <Heading
                        numberOfLines={2}
                        className="text-white"
                        size="3xl"
                      >
                        {data?.artist.name}
                      </Heading>
                    </VStack>
                  </SafeAreaView>
                </Box>
              </LinearGradient>
            </ImageBackground>
            <VStack className="px-6">
              <HStack className="items-center justify-between my-4">
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
                        <Heart color={themeConfig.theme.colors.white} />
                      </Animated.View>
                    )}
                  </Pressable>
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
                          transform: [{ scale: pressed ? 0.95 : 1 }],
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
              <Heading className="text-white">Top songs</Heading>
              <VStack>
                {topSongsError && <ErrorDisplay error={topSongsError} />}
                {isLoadingTopSongs && <Spinner size="large" />}
                {topSongsData?.topSongs.song?.map((song, index) => (
                  <TrackListItem
                    key={song.id}
                    showIndex
                    track={song}
                    index={index}
                  />
                ))}
                {!isLoadingTopSongs &&
                  !topSongsError &&
                  !topSongsData?.topSongs.song?.length && <EmptyDisplay />}
              </VStack>
              <Heading className="text-white">Discography</Heading>
            </VStack>
            {error && <ErrorDisplay error={error} />}
            {isLoading && <Spinner size="large" />}
          </>
        )}
        ListFooterComponent={() => (
          <VStack className="px-6 my-6">
            <Text className="text-white font-bold">14 songs ⦁ 45 min</Text>
          </VStack>
        )}
        contentContainerStyle={{ paddingHorizontal: 0 }}
      />
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
                  <User size={24} color={themeConfig.theme.colors.white} />
                </Box>
              )}
              <VStack className="ml-4">
                <Heading
                  className="text-white font-normal"
                  size="lg"
                  numberOfLines={1}
                >
                  {data?.artist.name}
                </Heading>
              </VStack>
            </HStack>
            <VStack className="mt-6 gap-y-8">
              <Pressable onPress={() => console.log("share pressed")}>
                {({ pressed }) => (
                  <Animated.View
                    className="flex-row items-center transition duration-100"
                    style={{
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                      opacity: pressed ? 0.5 : 1,
                    }}
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
