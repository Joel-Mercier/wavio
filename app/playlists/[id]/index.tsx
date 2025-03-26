import ErrorDisplay from "@/components/ErrorDisplay";
import TrackListItem from "@/components/tracks/TrackListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Pressable } from "@/components/ui/pressable";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import { usePlaylist } from "@/hooks/openSubsonic/usePlaylists";
import { cn } from "@/utils/tailwind";
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

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, error } = usePlaylist(id);
  const cover = useGetCoverArt(data?.playlist.coverArt, { size: 400 });
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
                  <ArrowLeft size={24} color={themeConfig.theme.colors.white} />
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
        {/* <ScrollView
          className={cn({ "h-full": !!error })}
          contentContainerClassName={cn({ "flex-1": !!error })}
        >
          {error ? (
            <ErrorDisplay error={error} />
          ) : (
            <>
              {isLoading ? (
                <Spinner size="large" />
              ) : (
                <>
                  <VStack>
                    <HStack className="mt-6 px-6 items-start justify-between">
                      <Pressable onPress={() => router.back()}>
                        <ArrowLeft
                          size={24}
                          color={themeConfig.theme.colors.white}
                        />
                      </Pressable>
                      <Image
                        source={require("@/assets/images/covers/gunship-unicorn.jpg")}
                        className="w-[70%] aspect-square rounded-md"
                        alt="Playlist cover"
                      />
                      <Box className="w-[70%] aspect-square rounded-md bg-primary-600 items-center justify-center">
                        <ListMusic
                          size={48}
                          color={themeConfig.theme.colors.white}
                        />
                      </Box>
                      <Box className="w-6" />
                    </HStack>
                    <VStack className="px-6">
                      <VStack className="mt-5">
                        <Heading
                          numberOfLines={1}
                          className="text-white"
                          size="2xl"
                        >
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
                    <Text className="text-white font-bold">data?.playlist.songCount +
                        (data?.playlist.songCount || 0 > 1
                          ? " song"
                          : "songs")" "
                      ⦁ Math.round((data?.playlist.duration || 0) / 60)min
                    </Text>
                  </VStack>
                </>
              )}
            </>
          )}
        </ScrollView> */}
      </SafeAreaView>
    </Box>
  );
}
