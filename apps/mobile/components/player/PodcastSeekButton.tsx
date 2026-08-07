import RotateCcw from "lucide-react-native/dist/esm/icons/rotate-ccw.mjs";
import RotateCw from "lucide-react-native/dist/esm/icons/rotate-cw.mjs";
import { useTranslation } from "react-i18next";
import FadeOut from "@/components/FadeOut";
import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";

const SIZE = 34;
const HIT_SLOP = { top: 16, bottom: 16, left: 12, right: 12 };

// A relative seek control for the podcast transport: the interval sits inside a
// circular arrow, the shape every podcast player uses for it. Neither half works
// alone — a bare arrow reads as "repeat", and a bare number has no direction.
export default function PodcastSeekButton({
  direction,
  seconds,
  onPress,
  testID,
}: {
  direction: "backward" | "forward";
  seconds: number;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTranslation();
  const Icon = direction === "backward" ? RotateCcw : RotateCw;
  return (
    <FadeOut
      testID={testID}
      onPress={onPress}
      hitSlop={HIT_SLOP}
      accessibilityLabel={t(
        direction === "backward"
          ? "app.player.seekBackward"
          : "app.player.seekForward",
        { seconds },
      )}
    >
      <Box
        className="items-center justify-center"
        style={{ width: SIZE, height: SIZE }}
      >
        <Icon size={SIZE} color="white" strokeWidth={1.75} />
        <Box className="absolute inset-0 items-center justify-center">
          <Text className="text-white font-bold" style={{ fontSize: 11 }}>
            {seconds}
          </Text>
        </Box>
      </Box>
    </FadeOut>
  );
}
