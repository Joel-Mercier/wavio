import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import type { Child } from "@/services/openSubsonic/types";
import { artworkUrl } from "@/utils/artwork";
import { cn } from "@/utils/tailwind";
import { AudioLines, CircleMinus, Menu } from "lucide-react-native";

interface PlaylistEditSongListItemProps {
  item: Child;
  index: number;
  beginDrag: () => void;
  isActive: boolean;
  handleRemoveFromPlaylistPress: (index: number) => void;
}

export default function PlaylistEditSongListItem({
  item,
  index,
  beginDrag,
  isActive,
  handleRemoveFromPlaylistPress,
}: PlaylistEditSongListItemProps) {
  return (
    <HStack
      className={cn("items-center justify-between px-6 py-4", {
        "bg-primary-600": isActive,
      })}
    >
      <HStack className="items-center">
        <FadeOutScaleDown
          className="mr-4"
          onPress={() => handleRemoveFromPlaylistPress(index + 1)}
        >
          <CircleMinus size={24} color={themeConfig.theme.colors.gray[400]} />
        </FadeOutScaleDown>
        {item.coverArt ? (
          <Image
            source={{
              uri: artworkUrl(item.coverArt),
            }}
            className="w-16 h-16 rounded-md aspect-square"
            alt="Track cover"
          />
        ) : (
          <Box className="w-16 h-16 aspect-square rounded-md bg-primary-600 items-center justify-center">
            <AudioLines size={24} color={themeConfig.theme.colors.white} />
          </Box>
        )}
        <VStack className="ml-4">
          <Heading className="text-white text-lg font-normal">
            {item.title}
          </Heading>
          <Text className="text-primary-100 text-sm">{item.artist}</Text>
        </VStack>
      </HStack>
      <FadeOutScaleDown onPress={beginDrag}>
        <Menu size={24} color={themeConfig.theme.colors.gray[400]} />
      </FadeOutScaleDown>
    </HStack>
  );
}
