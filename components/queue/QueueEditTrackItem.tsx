import { AudioLines, CircleMinus, Menu } from "lucide-react-native";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import type { QueueTrack } from "@/stores/queue";
import { cn } from "@/utils/tailwind";

interface QueueEditTrackItemProps {
  item: QueueTrack;
  beginDrag: () => void;
  isActive: boolean;
  isPlaying: boolean;
  onRemovePress: () => void;
}

export default function QueueEditTrackItem({
  item,
  beginDrag,
  isActive,
  isPlaying,
  onRemovePress,
}: QueueEditTrackItemProps) {
  return (
    <HStack
      className={cn("items-center justify-between py-2", {
        "bg-primary-600": isActive,
      })}
      style={{ height: 70 }}
    >
      <HStack className="items-center flex-1 mr-2">
        <FadeOutScaleDown className="mr-4" onPress={onRemovePress}>
          <CircleMinus size={24} color={themeConfig.theme.colors.gray[400]} />
        </FadeOutScaleDown>
        {item.artwork ? (
          <Image
            source={{ uri: item.artwork }}
            className="w-14 h-14 rounded-md aspect-square"
            alt="Track cover"
          />
        ) : (
          <Box className="w-14 h-14 aspect-square rounded-md bg-primary-600 items-center justify-center">
            <AudioLines size={20} color={themeConfig.theme.colors.white} />
          </Box>
        )}
        <VStack className="ml-4 flex-1">
          <Heading
            className={cn("text-lg font-normal", {
              "text-emerald-500": isPlaying,
              "text-white": !isPlaying,
            })}
            numberOfLines={1}
          >
            {item.title}
          </Heading>
          <Text className="text-primary-100 text-sm" numberOfLines={1}>
            {item.artist}
          </Text>
        </VStack>
      </HStack>
      <FadeOutScaleDown onPress={beginDrag}>
        <Menu size={24} color={themeConfig.theme.colors.gray[400]} />
      </FadeOutScaleDown>
    </HStack>
  );
}
