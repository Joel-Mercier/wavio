import ErrorDisplay from "@/components/ErrorDisplay";
import AlbumListItem from "@/components/albums/AlbumListItem";
import TrackListItem from "@/components/tracks/TrackListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ImageBackground } from "@/components/ui/image-background";
import { Pressable } from "@/components/ui/pressable";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useArtist, useTopSongs } from "@/hooks/openSubsonic/useBrowsing";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { cn } from "@/utils/tailwind";
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
} from "lucide-react-native";

export default function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, error } = useArtist(id);
  const cover = useGetCoverArt(data?.artist.coverArt, { size: 400 });
  const {
    data: topSongsData,
    isLoading: isLoadingTopSongs,
    error: topSongsError,
  } = useTopSongs(data?.artist.name, { count: 10 });

  return (
    <Box className="h-full">
      {/* <SafeAreaView className="h-full"> */}
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
                        <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                          <ArrowLeft
                            size={24}
                            color={themeConfig.theme.colors.white}
                          />
                        </Box>
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
                    <Heart color={themeConfig.theme.colors.white} />
                  </Pressable>
                  <Pressable>
                    <Share color={themeConfig.theme.colors.white} />
                  </Pressable>
                  <Pressable>
                    <EllipsisVertical color={themeConfig.theme.colors.white} />
                  </Pressable>
                </HStack>
                <HStack className="items-center gap-x-4">
                  <Pressable>
                    <Shuffle color={themeConfig.theme.colors.white} />
                  </Pressable>
                  <Pressable>
                    <Box className="w-12 h-12 rounded-full bg-emerald-500 items-center justify-center">
                      <Play
                        color={themeConfig.theme.colors.white}
                        fill={themeConfig.theme.colors.white}
                      />
                    </Box>
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
      {/* </SafeAreaView> */}
      {/* <ScrollView
        className={cn({ "h-full": !!error })}
        contentContainerClassName={cn({ "flex-1": !!error })}
      >
        {error ? (
          <ErrorDisplay error={error} />
        ) : (
          <>
            {isLoading ? (
              <SafeAreaView>
                <Spinner size="large" />
              </SafeAreaView>
            ) : (
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
                            <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                              <ArrowLeft
                                size={24}
                                color={themeConfig.theme.colors.white}
                              />
                            </Box>
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
                <SafeAreaView>
                  <VStack className="px-6">
                    <HStack className="items-center justify-between">
                      <HStack className="items-center gap-x-4">
                        <Pressable>
                          <Heart color={themeConfig.theme.colors.white} />
                        </Pressable>
                        <Pressable>
                          <Share color={themeConfig.theme.colors.white} />
                        </Pressable>
                        <Pressable>
                          <EllipsisVertical
                            color={themeConfig.theme.colors.white}
                          />
                        </Pressable>
                      </HStack>
                      <HStack className="items-center gap-x-4">
                        <Pressable>
                          <Shuffle color={themeConfig.theme.colors.white} />
                        </Pressable>
                        <Pressable>
                          <Box className="w-12 h-12 rounded-full bg-emerald-500 items-center justify-center">
                            <Play
                              color={themeConfig.theme.colors.white}
                              fill={themeConfig.theme.colors.white}
                            />
                          </Box>
                        </Pressable>
                      </HStack>
                    </HStack>
                  </VStack>
                  <VStack className="mt-6 px-6 gap-y-4">
                    <TrackListItem />
                    <TrackListItem />
                    <TrackListItem />
                    <TrackListItem />
                    <TrackListItem />
                    <TrackListItem />
                    <TrackListItem />
                    <TrackListItem />
                  </VStack>
                  <VStack className="px-6 my-6">
                    <Text className="text-white font-bold">
                      14 songs ⦁ 45 min
                    </Text>
                  </VStack>
                </SafeAreaView>
              </>
            )}
          </>
        )}
      </ScrollView> */}
    </Box>
  );
}
