import TrackListItem from "@/components/tracks/TrackListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Pressable } from "@/components/ui/pressable";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  EllipsisVertical,
  Heart,
  Play,
  Shuffle,
} from "lucide-react-native";

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  return (
    <Box>
      <SafeAreaView>
        <ScrollView>
          <VStack>
            <HStack className="mt-6 px-6 items-start justify-between">
              <Pressable onPress={() => router.back()}>
                <ArrowLeft size={24} color={themeConfig.theme.colors.white} />
              </Pressable>
              <Image
                source={require("@/assets/images/covers/gunship-unicorn.jpg")}
                className="w-[70%] aspect-square rounded-md"
                alt="Album cover"
              />
              <Box className="w-6" />
            </HStack>
            <VStack className="px-6">
              <HStack className="mt-5 items-center justify-between">
                <Heading numberOfLines={1} className="text-white" size="2xl">
                  Mercurial World
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
                  Magdalena Bay
                </Text>
              </HStack>
              <HStack className="mt-2 items-center">
                <Text className="text-primary-100">Album ● 10 mar. 2025</Text>
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
            <Text className="text-white font-bold">14 songs ● 45 min</Text>
            <Text className="text-primary-100 text-sm">© Recordings</Text>
          </VStack>
        </ScrollView>
      </SafeAreaView>
    </Box>
  );
}
