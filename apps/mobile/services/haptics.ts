import * as Haptics from "expo-haptics";
import { useAppBase } from "@/stores/app";

// Thin wrapper that gates every haptic on the user's global toggle
// (stores/app.ts) and swallows failures — haptics are a nicety, never a
// reason to crash a gesture handler. Read the setting off the store directly
// so non-React callers (worklet callbacks, services) can trigger feedback.
//
// On Android use Segment_Tick — the native effect used for fast-scroll list
// indexes, exactly this gesture — and fall back to a light impact on iOS.
export async function selectionHaptic() {
  if (!useAppBase.getState().hapticFeedbackEnabled) return;
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}
