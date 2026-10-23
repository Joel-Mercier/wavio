import { memo, useMemo } from "react";
import HomeShortcut from "@/components/home/HomeShortcut";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { useIsPlaying } from "@/hooks/player";
import useApp from "@/stores/app";
import useQueue from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import { activeRecentPlayKey, recentPlayKey } from "@/utils/activeRecentPlay";

function RecentPlaysSection() {
  const recentPlays = useRecentPlays((store) => store.recentPlays);
  const homeShortcutsCount = useApp((store) => store.homeShortcutsCount);
  const activeKey = useQueue((store) =>
    activeRecentPlayKey(
      store.source,
      store.currentIndex != null ? store.queue[store.currentIndex] : null,
    ),
  );
  const isPlaying = useIsPlaying();
  const rows = useMemo(() => {
    const shown = recentPlays.slice(0, homeShortcutsCount);
    const out: {
      a: (typeof recentPlays)[number];
      b?: (typeof recentPlays)[number];
    }[] = [];
    for (let i = 0; i < shown.length; i += 2) {
      out.push({ a: shown[i], b: shown[i + 1] });
    }
    return out;
  }, [recentPlays, homeShortcutsCount]);

  if (!rows.length) return null;

  const renderShortcut = (recentPlay: (typeof recentPlays)[number]) => {
    const isActive = recentPlayKey(recentPlay) === activeKey;
    return (
      <HomeShortcut
        recentPlay={recentPlay}
        isActive={isActive}
        playing={isActive && isPlaying}
      />
    );
  };

  return (
    <Box className="px-6 mb-4">
      <VStack className="gap-y-4">
        {rows.map(({ a, b }) => (
          <HStack key={`row-${a.id}`} className="gap-x-4">
            {renderShortcut(a)}
            {b && renderShortcut(b)}
          </HStack>
        ))}
      </VStack>
    </Box>
  );
}

export default memo(RecentPlaysSection);
