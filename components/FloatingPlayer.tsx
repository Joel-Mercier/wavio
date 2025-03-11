import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useActiveTrack } from "@weights-ai/react-native-track-player";
import { Play } from "lucide-react-native";
import MovingText from "./MovingText";

export default function FloatingPlayer() {
  const activeTrack = useActiveTrack();

  if (!activeTrack) {
    return null;
  }

  return (
    <Pressable className="absolute bottom-14 right-0 left-0">
      <HStack className="h-16 px-2 py-2 bg-primary-500 rounded-md items-center justify-between">
        <HStack className="items-center">
          <Image
            source={require("@/assets/images/covers/gunship-unicorn.jpg")}
            className="w-12 h-12 rounded-md"
            alt="Track cover"
          />
          <VStack className="ml-4 flex-1 overflow-hidden">
            <MovingText
              text="Everything in it's right place"
              animationThreshold={45}
            />
            <Text numberOfLines={1} className="text-primary-50">
              Radiohead
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
