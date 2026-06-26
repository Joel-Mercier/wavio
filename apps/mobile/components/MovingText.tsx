import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import {
  Children,
  isValidElement,
  type ReactElement,
  useEffect,
  useState,
} from "react";
import { type StyleProp, Text, type TextStyle, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const FADE_DURATION = 220;

interface TextChildProps {
  className?: string;
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

interface MovingTextProps {
  children: ReactElement<TextChildProps>;
  initialDelay?: number;
  endDelay?: number;
  pixelsPerSecond?: number;
  gap?: number;
  fadeWidth?: number;
}

export default function MovingText({
  children,
  initialDelay = 2000,
  endDelay = 1500,
  pixelsPerSecond = 40,
  gap = 24,
  fadeWidth = 24,
}: MovingTextProps) {
  const child = Children.only(children);
  const className = isValidElement(child) ? child.props.className : undefined;
  const style = isValidElement(child) ? child.props.style : undefined;
  const text = isValidElement(child) ? child.props.children : undefined;

  const translateX = useSharedValue(0);
  const fadeProgress = useSharedValue(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);

  const overflow = Math.max(0, textWidth - containerWidth);
  const shouldAnimate = overflow > 0 && containerWidth > 0;
  const distance = overflow + gap;
  const fadeFraction =
    containerWidth > 0 ? Math.min(0.5, fadeWidth / containerWidth) : 0;

  useEffect(() => {
    if (!shouldAnimate) {
      cancelAnimation(translateX);
      cancelAnimation(fadeProgress);
      translateX.value = 0;
      fadeProgress.value = 0;
      return;
    }
    const duration = Math.max(1000, (distance / pixelsPerSecond) * 1000);
    translateX.value = 0;
    fadeProgress.value = 0;
    // fadeProgress drives the left-edge fade only (the right edge stays faded
    // throughout). It eases in once the text leaves the start and stays on
    // through the forward scroll, the end pause and the scroll back, easing
    // out only once the text has returned to the start.
    translateX.value = withRepeat(
      withSequence(
        withDelay(
          initialDelay,
          withTiming(0, { duration: 0 }, (finished) => {
            if (finished) {
              fadeProgress.value = withTiming(1, { duration: FADE_DURATION });
            }
          }),
        ),
        withTiming(-distance, { duration, easing: Easing.linear }),
        withDelay(endDelay, withTiming(-distance, { duration: 0 })),
        withTiming(
          0,
          {
            duration: Math.max(400, duration / 2),
            easing: Easing.out(Easing.cubic),
          },
          (finished) => {
            if (finished) {
              fadeProgress.value = withTiming(0, { duration: FADE_DURATION });
            }
          },
        ),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(translateX);
      cancelAnimation(fadeProgress);
      translateX.value = 0;
      fadeProgress.value = 0;
    };
  }, [
    translateX,
    fadeProgress,
    shouldAnimate,
    distance,
    initialDelay,
    endDelay,
    pixelsPerSecond,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  // Both layers carry the right-edge fade so it stays constant; they differ only
  // on the left edge, so crossfading them animates the left fade alone.
  const leftSharpLayerStyle = useAnimatedStyle(() => ({
    opacity: 1 - fadeProgress.value,
  }));
  const leftFadedLayerStyle = useAnimatedStyle(() => ({
    opacity: fadeProgress.value,
  }));

  // Base text defines the row height and is shown verbatim when the text fits.
  // While animating it stays as an invisible height spacer behind the moving copy.
  const content = (
    <>
      <Text
        numberOfLines={1}
        className={className}
        style={[style, shouldAnimate ? { opacity: 0 } : undefined]}
      >
        {text}
      </Text>
      {shouldAnimate && (
        <Animated.Text
          numberOfLines={1}
          ellipsizeMode="clip"
          className={className}
          style={[
            style,
            animatedStyle,
            {
              position: "absolute",
              left: 0,
              top: 0,
              width: textWidth,
            },
          ]}
        >
          {text}
        </Animated.Text>
      )}
    </>
  );

  return (
    <View
      style={{ width: "100%", overflow: "hidden" }}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {/* The right edge is always faded; crossfade a left-sharp copy with a
          left-faded copy so the left fade eases in/out (instead of snapping)
          as the text leaves and returns to the start. */}
      {shouldAnimate && fadeFraction > 0 ? (
        <>
          <Animated.View style={leftSharpLayerStyle}>
            <MaskedView
              maskElement={
                <LinearGradient
                  colors={["#000", "#000", "transparent"]}
                  locations={[0, 1 - fadeFraction, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ flex: 1 }}
                />
              }
            >
              {content}
            </MaskedView>
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[
              { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
              leftFadedLayerStyle,
            ]}
          >
            <MaskedView
              maskElement={
                <LinearGradient
                  colors={["transparent", "#000", "#000", "transparent"]}
                  locations={[0, fadeFraction, 1 - fadeFraction, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ flex: 1 }}
                />
              }
            >
              {content}
            </MaskedView>
          </Animated.View>
        </>
      ) : (
        content
      )}
      {/* Off-screen natural-width measurer. The wide wrapper lets the Text expand
          to its natural single-line width without being clipped by the parent. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 10000,
          opacity: 0,
        }}
      >
        <Text
          className={className}
          style={[style, { alignSelf: "flex-start" }]}
          onLayout={(e) => setTextWidth(Math.ceil(e.nativeEvent.layout.width))}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}
