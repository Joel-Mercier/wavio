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
import { useAlbum } from "@/hooks/openSubsonic/useBrowsing";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import type { Child } from "@/services/openSubsonic/types";
import { cn } from "@/utils/tailwind";
import { FlashList } from "@shopify/flash-list";
import { format, parse } from "date-fns";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Disc3,
  EllipsisVertical,
  Heart,
  Play,
  Shuffle,
} from "lucide-react-native";
import React from "react";

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, error } = useAlbum(id);
  const cover = useGetCoverArt(data?.album.coverArt, { size: 400 });
  console.log(data?.album);
  return (
    <Box>
      <SafeAreaView>
        <FlashList
          data={data?.album.song}
          renderItem={({ item, index }: { item: Child; index: number }) => (
            <TrackListItem track={item} />
          )}
          estimatedItemSize={70}
          ListHeaderComponent={() => (

          )}
          ListFooterComponent={() => (
            <VStack className="px-6 my-6">
              <Text className="text-white font-bold">
                {data?.album.songCount +
                  (data?.album.songCount || 0 > 1
                    ? " song"
                    : "songs")}{" "}
                ⦁ {Math.round((data?.album.duration || 0) / 60)} min
              </Text>
              {data?.album.recordLabels?.map((recordLabel) => (
                <Text
                  className="text-primary-100 text-sm"
                  key={recordLabel.name}
                >
                  © {recordLabel.name}
                </Text>
              ))}
            </VStack>
          )}
          contentContainerStyle={{}}
        />
        <ScrollView
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
                      {cover.isLoading ? (
                        <Box className="w-[70%] aspect-square rounded-md bg-primary-600 items-center justify-center">
                          <Disc3
                            size={48}
                            color={themeConfig.theme.colors.white}
                          />
                        </Box>
                      ) : (
                        <Image
                          source={{
                            uri: `data:image/jpeg;base64,${cover?.data}`,
                          }}
                          className="w-[70%] aspect-square rounded-md"
                          alt="Album cover"
                        />
                      )}
                      <Box className="w-6" />
                    </HStack>
                    <VStack className="px-6">
                      <HStack className="mt-5 items-center justify-between">
                        <Heading
                          numberOfLines={1}
                          className="text-white"
                          size="2xl"
                        >
                          {data?.album.name}
                        </Heading>
                      </HStack>
                      <HStack className="mt-4 items-center">
                        <Image
                          source={require("@/assets/images/covers/gunship-unicorn.jpg")}
                          className="w-8 h-8 rounded-full"
                          alt="Artist cover"
                        />
                        <Text
                          className="ml-4 text-white text-md font-bold"
                          numberOfLines={1}
                        >
                          {((data?.album?.artists?.length || 0) > 1 &&
                            data?.album.artists?.map((artist) => (
                              <Link
                                key={artist.id}
                                href={`/artists/${artist.id}`}
                              >
                                {artist.name}
                              </Link>
                            ))) || (
                              <Link href={`/artists/${data?.album.artistId}`}>
                                {data?.album.displayArtist}
                              </Link>
                            ) || (
                              <Link href={`/artists/${data?.album.artistId}`}>
                                {data?.album.artist}
                              </Link>
                            )}
                        </Text>
                      </HStack>
                      <HStack className="mt-2 items-center">
                        <Text className="text-primary-100">
                          {data?.album.isCompilation ? "Compilation" : "Album"}{" "}
                          ⦁{" "}
                          {data?.album.originalReleaseDate &&
                            format(
                              parse(
                                `${data?.album.originalReleaseDate?.day}/${data?.album.originalReleaseDate?.month}/${data?.album.originalReleaseDate?.year}`,
                                "d/M/yyyy",
                                new Date(),
                              ),
                              "dd MMM yyyy",
                            )}
                        </Text>
                      </HStack>
                      <HStack className="mt-4 items-center justify-between">
                        <HStack className="items-center gap-x-4">
                          <Pressable>
                            <Heart
                              color={themeConfig.theme.colors.white}
                              fill={themeConfig.theme.colors.white}
                            />
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
                    <Text className="text-white font-bold">
                      {data?.album.songCount +
                        (data?.album.songCount || 0 > 1
                          ? " song"
                          : "songs")}{" "}
                      ⦁ {Math.round((data?.album.duration || 0) / 60)} min
                    </Text>
                    {data?.album.recordLabels?.map((recordLabel) => (
                      <Text
                        className="text-primary-100 text-sm"
                        key={recordLabel.name}
                      >
                        © {recordLabel.name}
                      </Text>
                    ))}
                  </VStack>
                </>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Box>
  );
}
