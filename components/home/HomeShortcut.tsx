import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";

export default function HomeShortcut() {
  return (
    <FadeOutScaleDown href="/favorites" className="flex-1">
      <HStack className="items-center rounded-md bg-primary-600 overflow-hidden">
        <Image
          source={require("@/assets/images/covers/gunship-unicorn.jpg")}
          className="w-16 h-16 aspect-square"
          alt="cover"
        />
        <Box>
          <Heading
            numberOfLines={2}
            size="sm"
            className="text-white font-bold mx-2"
          >
            Favorite tracks
          </Heading>
        </Box>
      </HStack>
    </FadeOutScaleDown>
  );
}
