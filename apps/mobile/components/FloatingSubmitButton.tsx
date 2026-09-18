import { LinearGradient } from "expo-linear-gradient";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";

// Button height plus the breathing room a scrollable screen must add on top of
// useScreenBottomPadding() so its last row can scroll out from under the button.
export const FLOATING_SUBMIT_BUTTON_SPACE = 96;

const GRADIENT_FADE_HEIGHT = 144;

interface FloatingSubmitButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  isPending?: boolean;
  testID?: string;
}

// Floats above the floating player / tab bar with a transparent-to-black
// gradient underneath, the way the add-to-playlist screen submits. The
// gradient is `box-none` so the list beneath keeps scrolling through it.
export default function FloatingSubmitButton({
  label,
  onPress,
  disabled = false,
  isPending = false,
  testID,
}: FloatingSubmitButtonProps) {
  const [primary800] = Uniwind.getCSSVariable([
    "--color-primary-800",
  ]) as string[];
  const screenBottomPadding = useScreenBottomPadding();

  return (
    <LinearGradient
      pointerEvents="box-none"
      colors={["transparent", "#000000"]}
      locations={[0, 0.6]}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: GRADIENT_FADE_HEIGHT,
        paddingBottom: screenBottomPadding,
        alignItems: "center",
      }}
    >
      <FadeOutScaleDown
        testID={testID}
        className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
        onPress={onPress}
        disabled={disabled || isPending}
      >
        {isPending ? (
          <Spinner color={primary800} />
        ) : (
          <Text className="text-primary-800 font-bold text-lg">{label}</Text>
        )}
      </FadeOutScaleDown>
    </LinearGradient>
  );
}
