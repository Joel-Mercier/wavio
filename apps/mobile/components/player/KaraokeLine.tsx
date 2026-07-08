import { useEffect, useState } from "react";
import { Uniwind } from "uniwind";
import { Text } from "@/components/ui/text";
import {
  getPlaybackSnapshot,
  subscribePlaybackProgress,
} from "@/hooks/player/playbackSnapshot";
import type { CueLine } from "@/services/openSubsonic/types";
import { findCurrentCueIndex } from "@/utils/lyrics";

const UPCOMING_COLOR = "rgba(255,255,255,0.4)";

// A space is only inserted between two cues when neither already carries edge
// whitespace, since word-timed lyric formats vary in whether spacing lives
// inside a cue value or between them.
function needsSpace(prev: string, curr: string): boolean {
  return !!prev && !/\s$/.test(prev) && !/^\s/.test(curr);
}

export default function KaraokeLine({
  cueLine,
  offsetMs = 0,
  textClassName,
  numberOfLines,
}: {
  cueLine: CueLine;
  offsetMs?: number;
  textClassName?: string;
  numberOfLines?: number;
}) {
  const [emerald500, white] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-white",
  ]) as string[];
  const cues = cueLine.cue ?? [];
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const update = () => {
      const { currentTime } = getPlaybackSnapshot();
      const positionMs = (currentTime ?? 0) * 1000 + offsetMs;
      const next = findCurrentCueIndex(cues, positionMs);
      setActiveIndex((prev) => (prev === next ? prev : next));
    };
    update();
    return subscribePlaybackProgress(update);
  }, [cues, offsetMs]);

  return (
    <Text className={textClassName} numberOfLines={numberOfLines}>
      {cues.map((cue, index) => {
        const color =
          index < activeIndex
            ? white
            : index === activeIndex
              ? emerald500
              : UPCOMING_COLOR;
        const prefix =
          index > 0 && needsSpace(cues[index - 1].value, cue.value) ? " " : "";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: cues are a stable ordered list
          <Text key={index} className={textClassName} style={{ color }}>
            {prefix}
            {cue.value}
          </Text>
        );
      })}
    </Text>
  );
}
