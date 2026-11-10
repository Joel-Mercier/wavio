import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import type { ComponentProps, ReactNode } from "react";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ScreenHeaderGradient from "@/components/ScreenHeaderGradient";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { VStack } from "@/components/ui/vstack";
import { goBackOrHome } from "@/utils/navigation";

const AnimatedBox = Animated.createAnimatedComponent(Box);

// The bar that fades in over a detail screen once its hero scrolls away.
export function DetailStickyHeader({
  title,
  style,
  right,
}: {
  title: ReactNode;
  style: ComponentProps<typeof AnimatedBox>["style"];
  right?: ReactNode;
}) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <AnimatedBox
      className="w-full z-10 absolute top-0 left-0 right-0"
      style={style}
    >
      <ScreenHeaderGradient opaque>
        <HStack
          className="items-center justify-between pb-4 px-6"
          style={{ paddingTop: insets.top + 16 }}
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
          {right ?? <Box className="w-10" />}
        </HStack>
      </ScreenHeaderGradient>
    </AnimatedBox>
  );
}

// The tinted block at the top of a detail screen's list, with its back button
// and title.
export function DetailHero({
  title,
  height = 192,
}: {
  title: ReactNode;
  height?: number;
}) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScreenHeaderGradient height={height}>
      <Box className="flex-1" style={{ paddingTop: insets.top }}>
        <VStack className="mt-6 px-6 items-start justify-between h-full -mb-12">
          <Pressable onPress={() => goBackOrHome(router)}>
            {({ pressed }) => (
              <Animated.View
                className="transition duration-100 w-10 h-10 rounded-full bg-black/40 items-center justify-center"
                style={{
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                  opacity: pressed ? 0.5 : 1,
                }}
              >
                <ArrowLeft size={24} color={white} />
              </Animated.View>
            )}
          </Pressable>
          <Heading numberOfLines={2} className="text-white mb-12" size="xl">
            {title}
          </Heading>
        </VStack>
      </Box>
    </ScreenHeaderGradient>
  );
}
