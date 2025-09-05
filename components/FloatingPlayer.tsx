import FadeOut from "@/components/FadeOut";
import MovingText from "@/components/MovingText";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { usePathname, useRouter } from "expo-router";
import { AudioLines, Pause, Play } from "lucide-react-native";
import { AudioPro, AudioProState, useAudioPro } from "react-native-audio-pro";

export const FLOATING_PLAYER_HEIGHT = 64;

export default function FloatingPlayer() {
  const { state, playingTrack } = useAudioPro();
  const router = useRouter();
  const pathname = usePathname();

  const handlePress = () => {
    router.navigate("/player");
  };

  const handlePlayPausePress = () => {
    if (state === AudioProState.PLAYING) {
      AudioPro.pause();
    } else {
      AudioPro.resume();
    }
  };

  if (!playingTrack || pathname.startsWith("/player")) {
    return null;
  }

  return (
    <Pressable
      className="absolute bottom-28 right-0 left-0"
      onPress={handlePress}
    >
      <HStack className="h-16 px-4 py-2 bg-primary-500 rounded-md items-center justify-between">
        <HStack className="items-center">
          {playingTrack.artwork ? (
            <Image
              source={{ uri: playingTrack.artwork }}
              className="w-12 h-12 rounded-md aspect-square"
              alt="Track cover"
            />
          ) : (
            <Box className="w-12 h-12 rounded-md bg-primary-600 items-center justify-center">
              <AudioLines size={24} color={themeConfig.theme.colors.white} />
            </Box>
          )}

          <VStack className="ml-4 overflow-hidden">
            {/* <MovingText
              text={activeTrack.title || ""}
              animationThreshold={45}
            /> */}
            <Text numberOfLines={1} className="text-white font-bold text-md">
              {playingTrack.title}
            </Text>
            <Text numberOfLines={1} className="text-primary-50">
              {playingTrack.artist}
            </Text>
          </VStack>
        </HStack>
        <HStack className="items-center">
          <FadeOut onPress={handlePlayPausePress}>
            {state === AudioProState.PLAYING ? (
              <Pause
                color={themeConfig.theme.colors.white}
                stroke={undefined}
                fill={themeConfig.theme.colors.white}
              />
            ) : (
              <Play
                color={themeConfig.theme.colors.white}
                stroke={undefined}
                fill={themeConfig.theme.colors.white}
              />
            )}
          </FadeOut>
        </HStack>
      </HStack>
    </Pressable>
  );
}
