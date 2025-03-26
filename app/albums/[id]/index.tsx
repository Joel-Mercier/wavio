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
import { useAlbum } from "@/hooks/openSubsonic/useBrowsing";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import type { Child } from "@/services/openSubsonic/types";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { format, parse } from "date-fns";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Disc3,
  EllipsisVertical,
  Heart,
  ListPlus,
  Play,
  PlusCircle,
  Share,
  Shuffle,
  User,
} from "lucide-react-native";
import React, { useCallback, useRef } from "react";
import Animated from "react-native-reanimated";

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const { data, isLoading, error } = useAlbum(id);
  const cover = useGetCoverArt(data?.album.coverArt, { size: 400 });

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleGoToArtistPress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.navigate(`/artists/${data?.album.artists[0].id}`);
  };

  return (
    <Box>
      <SafeAreaView className="h-full">
        <FlashList
          data={data?.album.song}
          renderItem={({ item, index }: { item: Child; index: number }) => (
            <TrackListItem track={item} cover={cover?.data} index={index} />
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
                {cover.isLoading ? (
                  <Box className="w-[70%] aspect-square rounded-md bg-primary-600 items-center justify-center">
                    <Disc3 size={48} color={themeConfig.theme.colors.white} />
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
              <VStack>
                <HStack className="mt-5 items-center justify-between">
                  <Heading numberOfLines={1} className="text-white" size="2xl">
                    {data?.album.name}
                  </Heading>
                </HStack>
                <HStack className="mt-4 items-center">
                  <Box className="w-8 h-8 rounded-full bg-primary-600 items-center justify-center">
                    <User size={16} color={themeConfig.theme.colors.white} />
                  </Box>
                  <Text
                    className="ml-4 text-white text-md font-bold"
                    numberOfLines={1}
                  >
                    {((data?.album?.artists?.length || 0) > 1 &&
                      data?.album.artists?.map((artist) => (
                        <Link key={artist.id} href={`/artists/${artist.id}`}>
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
                    {data?.album.isCompilation ? "Compilation" : "Album"} ⦁{" "}
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
                      {({ pressed }) => (
                        <Animated.View
                          className="transition duration-100"
                          style={{
                            transform: [{ scale: pressed ? 0.95 : 1 }],
                            opacity: pressed ? 0.5 : 1,
                          }}
                        >
                          <Heart
                            color={themeConfig.theme.colors.white}
                            fill={themeConfig.theme.colors.white}
                          />
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
              </VStack>
              {error && <ErrorDisplay error={error} />}
              {isLoading && <Spinner size="large" />}
            </VStack>
          )}
          ListFooterComponent={() => (
            <VStack className="my-6">
              <Text className="text-white font-bold">
                {(data?.album.songCount || "0 ") +
                  (data?.album.songCount || 0 > 1 ? " song" : "songs")}{" "}
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
                  className="w-16 h-16 rounded-md aspect-square"
                  alt="Track cover"
                />
              ) : (
                <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                  <Disc3 size={24} color={themeConfig.theme.colors.white} />
                </Box>
              )}
              <VStack className="ml-4">
                <Heading
                  className="text-white font-normal"
                  size="lg"
                  numberOfLines={1}
                >
                  {data?.album.name}
                </Heading>
                <Text numberOfLines={1} className="text-md text-primary-100">
                  {data?.album.artist}
                </Text>
              </VStack>
            </HStack>
            <VStack className="mt-6 gap-y-8">
              <Pressable>
                {({ pressed }) => (
                  <Animated.View
                    className="flex-row items-center transition duration-100"
                    style={{
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                      opacity: pressed ? 0.5 : 1,
                    }}
                  >
                    <PlusCircle
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      Add to playlist
                    </Text>
                  </Animated.View>
                )}
              </Pressable>
              <Pressable onPress={handleGoToArtistPress}>
                {({ pressed }) => (
                  <Animated.View
                    className="flex-row items-center transition duration-100"
                    style={{
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                      opacity: pressed ? 0.5 : 1,
                    }}
                  >
                    <User
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      Go to artist
                    </Text>
                  </Animated.View>
                )}
              </Pressable>
              <Pressable>
                {({ pressed }) => (
                  <Animated.View
                    className="flex-row items-center transition duration-100"
                    style={{
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                      opacity: pressed ? 0.5 : 1,
                    }}
                  >
                    <ListPlus
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      Add to queue
                    </Text>
                  </Animated.View>
                )}
              </Pressable>
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
