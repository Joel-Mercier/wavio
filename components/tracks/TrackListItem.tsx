import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { EllipsisVertical } from "lucide-react-native";
import { Heading } from "../ui/heading";
import { Image } from "../ui/image";
import { Pressable } from "../ui/pressable";
import { Text } from "../ui/text";

export default function TrackListItem() {
  return (
    <HStack className="items-center justify-between">
      <HStack className="items-center">
        <Image
          source={require("@/assets/images/covers/gunship-unicorn.jpg")}
          className="w-16 h-16 rounded-md"
          alt="Track cover"
        />
        <VStack className="ml-4">
          <Heading
            className="text-white text-md font-normal capitalize"
            numberOfLines={1}
          >
            Everything in it's right place
          </Heading>
          <Text numberOfLines={1} className="text-md text-primary-100">
            Radiohead
          </Text>
        </VStack>
      </HStack>
      <Pressable>
        {({ pressed }) => (
          <EllipsisVertical color={themeConfig.theme.colors.gray[300]} />
        )}
      </Pressable>
    </HStack>
  );
}
