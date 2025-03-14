import TrackListItem from "@/components/tracks/TrackListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ArrowLeft, Play, Shuffle } from "lucide-react-native";

export default function FavoritesScreen() {
  const router = useRouter();

  return (
    <Box>
      <ScrollView>
        <LinearGradient
          colors={[themeConfig.theme.colors.blue[500], "#000000"]}
          className="h-48"
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
                <Heading numberOfLines={2} className="text-white" size="xl">
                  Favorite tracks
                </Heading>
              </VStack>
            </SafeAreaView>
          </Box>
        </LinearGradient>
        <SafeAreaView>
          <VStack className="px-6">
            <HStack className="items-center justify-between">
              <HStack className="items-center gap-x-4">
                <Text className="text-primary-100" numberOfLines={1}>
                  14 songs
                </Text>
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
          <VStack className="my-6 px-6 gap-y-4">
            <TrackListItem />
            <TrackListItem />
            <TrackListItem />
            <TrackListItem />
            <TrackListItem />
            <TrackListItem />
            <TrackListItem />
            <TrackListItem />
            <TrackListItem />
            <TrackListItem />
            <TrackListItem />
            <TrackListItem />
            <TrackListItem />
          </VStack>
        </SafeAreaView>
      </ScrollView>
    </Box>
  );
}
