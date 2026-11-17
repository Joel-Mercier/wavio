import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { Uniwind } from "uniwind";
import { Text } from "@/components/ui/text";
import type { CueLine } from "@/services/openSubsonic/types";
import {
  buildFillWords,
  type FillWord,
  LYRIC_FLEX_ALIGN,
  type LyricAlign,
  wordFillProgress,
} from "@/utils/lyrics";

// The filled copy is revealed by sliding its clipping window and counter-
// sliding the text inside it: transforms only, so a frame never relayouts.
function FillWordView({
  word,
  position,
  textClassName,
  fillColor,
  spaced,
}: {
  word: FillWord;
  position: SharedValue<number>;
  textClassName?: string;
  fillColor: string;
  spaced: boolean;
}) {
  const width = useSharedValue(0);
  const unfilled = useDerivedValue(
    () =>
      (1 - wordFillProgress(position.value, word.start, word.end)) *
      width.value,
  );
  const clipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -unfilled.value }],
  }));
  const textStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: unfilled.value }],
  }));

  return (
    <View style={styles.word}>
      <View
        onLayout={(e) => {
          width.value = e.nativeEvent.layout.width;
        }}
      >
        <Text className={textClassName} numberOfLines={1}>
          {word.text}
        </Text>
        <Animated.View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={[styles.clip, clipStyle]}
        >
          <Animated.View style={textStyle}>
            <Text
              className={textClassName}
              numberOfLines={1}
              style={{ color: fillColor }}
            >
              {word.text}
            </Text>
          </Animated.View>
        </Animated.View>
      </View>
      {spaced && <Text className={textClassName}> </Text>}
    </View>
  );
}

export default function KaraokeFillLine({
  cueLine,
  position,
  textClassName,
  align = "left",
}: {
  cueLine: CueLine;
  position: SharedValue<number>;
  textClassName?: string;
  align?: LyricAlign;
}) {
  const [emerald500] = Uniwind.getCSSVariable([
    "--color-emerald-500",
  ]) as string[];
  const words = useMemo(() => buildFillWords(cueLine), [cueLine]);

  return (
    <View
      accessible
      accessibilityLabel={cueLine.value}
      style={[styles.line, { justifyContent: LYRIC_FLEX_ALIGN[align] }]}
    >
      {words.map((word, index) => (
        <FillWordView
          // biome-ignore lint/suspicious/noArrayIndexKey: words are a stable ordered list
          key={index}
          word={word}
          position={position}
          textClassName={textClassName}
          fillColor={emerald500}
          spaced={index < words.length - 1}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", flexWrap: "wrap" },
  word: { flexDirection: "row" },
  clip: { ...StyleSheet.absoluteFill, overflow: "hidden" },
});
