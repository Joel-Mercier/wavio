import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useRouter } from "expo-router";
import { AudioLines, Play } from "lucide-react-native";
import { useActiveTrack } from "react-native-track-player";
import MovingText from "./MovingText";
import { Box } from "./ui/box";

export default function FloatingPlayer() {
  const activeTrack = useActiveTrack();
  const router = useRouter();

  const handlePress = () => {
    router.navigate("/player");
  };

  if (!activeTrack) {
    return null;
  }

  return (
    <Pressable
      className="absolute bottom-14 right-0 left-0"
      onPress={handlePress}
    >
      <HStack className="h-16 px-2 py-2 bg-primary-500 rounded-md items-center justify-between">
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

          <VStack className="ml-4 flex-1 overflow-hidden">
            <MovingText
              text={activeTrack.title || ""}
              animationThreshold={45}
            />
            <Text numberOfLines={1} className="text-primary-50">
              {activeTrack.artist}
            </Text>
          </VStack>
        </HStack>
        <HStack className="items-center">
          <Pressable>
            <Play
              color={themeConfig.theme.colors.white}
              fill={themeConfig.theme.colors.white}
            />
          </Pressable>
        </HStack>
      </HStack>
    </Pressable>
  );
}
