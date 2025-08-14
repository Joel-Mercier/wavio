import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { usePathname, useRouter } from "expo-router";
import { AudioLines, Pause, Play } from "lucide-react-native";
import TrackPlayer, {
  State,
  useActiveTrack,
  usePlaybackState,
} from "react-native-track-player";
import FadeOut from "./FadeOut";
import MovingText from "./MovingText";
import { Box } from "./ui/box";

export default function FloatingPlayer() {
  const activeTrack = useActiveTrack();
  const playbackState = usePlaybackState();
  const router = useRouter();
  const pathname = usePathname();

  const handlePress = () => {
    router.navigate("/player");
  };

  const handlePlayPausePress = () => {
    if (playbackState.state === State.Playing) {
      TrackPlayer.pause();
    } else {
      TrackPlayer.play();
    }
  };

  if (!activeTrack || pathname.startsWith("/player")) {
    return null;
  }

  return (
    <Pressable
      className="absolute bottom-28 right-0 left-0"
      onPress={handlePress}
    >
      <HStack className="h-16 px-4 py-2 bg-primary-500 rounded-md items-center justify-between">
        <HStack className="items-center">
          {activeTrack.artwork ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${activeTrack.artwork}` }}
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
              {activeTrack.title}
            </Text>
            <Text numberOfLines={1} className="text-primary-50">
              {activeTrack.artist}
            </Text>
          </VStack>
        </HStack>
        <HStack className="items-center">
          <FadeOut onPress={handlePlayPausePress}>
            {playbackState.state === State.Playing ? (
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
