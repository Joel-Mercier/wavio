import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import type { ReactNode, RefObject } from "react";
import type { ScrollView as RNScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import useApp from "@/stores/app";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

export default function SettingsScreenScaffold({
  title,
  children,
  overlays,
  scrollRef,
}: {
  title: string;
  children: ReactNode;
  // Dialogs and bottom sheets that must render outside the ScrollView (at the
  // root Box level) so they overlay the whole screen.
  overlays?: ReactNode;
  // Lets a section scroll itself to one of its rows (deep link into a setting).
  scrollRef?: RefObject<RNScrollView | null>;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const isWideLayout = useApp((s) => s.isWideLayout);

  return (
    <Box className="h-full">
      <Box className={cn("px-6 pb-6 flex-1", isWideLayout ? "mb-6" : "mt-6")}>
        <HStack
          className="items-center justify-between mb-6"
          style={{ paddingTop: insets.top }}
        >
          <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <Heading className="text-white text-center flex-1" size="lg">
            {title}
          </Heading>
          <Box className="w-6" />
        </HStack>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: screenBottomPadding,
          }}
        >
          {children}
        </ScrollView>
      </Box>
      {overlays}
    </Box>
  );
}
