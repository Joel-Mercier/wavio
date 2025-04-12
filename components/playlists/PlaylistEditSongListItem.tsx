import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import type { Child } from "@/services/openSubsonic/types";
import { cn } from "@/utils/tailwind";
import { CircleMinus, Menu } from "lucide-react-native";

export default function PlaylistEditSongListItem({
  item,
  beginDrag,
  isActive,
}: { item: Child; beginDrag: () => void; isActive: boolean }) {
  return (
    <HStack
      className={cn("items-center justify-between px-6 py-4", {
        "bg-primary-600": isActive,
      })}
    >
      <HStack className="items-center">
        <FadeOutScaleDown>
          <CircleMinus size={24} color={themeConfig.theme.colors.gray[400]} />
        </FadeOutScaleDown>
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
