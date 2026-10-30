import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import useApp from "@/stores/app";
import { goBackOrHome } from "@/utils/navigation";

export default function AudiobookScreenHeader({
  title,
  right,
}: {
  title: string;
  right?: ReactNode;
}) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWideLayout = useApp((s) => s.isWideLayout);
  return (
    <HStack
      className="items-center justify-between pb-4 px-6"
      style={{ paddingTop: insets.top + (isWideLayout ? 0 : 16) }}
    >
      <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
        <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
          <ArrowLeft size={24} color={white} />
        </Box>
      </FadeOutScaleDown>
      <Heading
        numberOfLines={1}
        className="text-white font-bold flex-1 mx-4 text-center"
        size="lg"
      >
        {title}
      </Heading>
      <Box className="w-10 items-end">{right}</Box>
    </HStack>
  );
}
