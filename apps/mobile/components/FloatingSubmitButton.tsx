import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet } from "react-native";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
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
// gradient underneath, the way the add-to-playlist screen submits. Touches
// must reach the list beneath, but `box-none` on the LinearGradient itself
// isn't enough: on Android it renders the gradient as a full-size child view,
// which swallows taps. The gradient is therefore its own `none` layer.
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
  const screenBottomPadding = useScreenBottomPadding({ floating: true });

  return (
    <Box
      pointerEvents="box-none"
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
      <LinearGradient
        pointerEvents="none"
        colors={["transparent", "#000000"]}
        locations={[0, 0.6]}
        style={StyleSheet.absoluteFill}
      />
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
    </Box>
  );
}
