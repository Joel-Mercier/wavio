import TrackListItem from "@/components/tracks/TrackListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ImageBackground } from "@/components/ui/image-background";
import { Pressable } from "@/components/ui/pressable";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  EllipsisVertical,
  Heart,
  Play,
  Share,
  Shuffle,
} from "lucide-react-native";

export default function ArtistScreen() {
  const router = useRouter();
  return (
    <Box>
      <ScrollView>
        <ImageBackground
          source={require("@/assets/images/covers/gunship-unicorn.jpg")}
          alt="Artist cover"
          className="h-96"
          resizeMode="cover"
        >
          <LinearGradient colors={["transparent", "#000000"]} className="h-96">
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
                  <Heading numberOfLines={2} className="text-white" size="3xl">
                    King Gizzard & The Lizard Wizard
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
          </VStack>
        </SafeAreaView>
      </ScrollView>
    </Box>
  );
}
