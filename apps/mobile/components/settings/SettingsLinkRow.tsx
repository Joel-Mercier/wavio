import type { Href } from "expo-router";
import ChevronRight from "lucide-react-native/dist/esm/icons/chevron-right.mjs";
import type { ReactNode } from "react";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";

export default function SettingsLinkRow({
  icon,
  title,
  description,
  href,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  href: Href;
}) {
  const [gray200] = Uniwind.getCSSVariable(["--color-gray-200"]) as string[];
  return (
    <FadeOutScaleDown href={href}>
      <HStack className="items-center gap-x-4 py-4">
        <Box className="w-8 items-center">{icon}</Box>
        <VStack className="gap-y-1 flex-1">
          <Heading className="text-white font-normal" size="md">
            {title}
          </Heading>
          <Text className="text-primary-100 text-sm">{description}</Text>
        </VStack>
        <ChevronRight size={20} color={gray200} />
      </HStack>
    </FadeOutScaleDown>
  );
}
