import { memo, useMemo } from "react";
import HomeShortcut from "@/components/home/HomeShortcut";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import useRecentPlays from "@/stores/recentPlays";

function RecentPlaysSection() {
  const recentPlays = useRecentPlays((store) => store.recentPlays);
  const rows = useMemo(() => {
    const out: {
      a: (typeof recentPlays)[number];
      b?: (typeof recentPlays)[number];
    }[] = [];
    for (let i = 0; i < recentPlays.length; i += 2) {
      out.push({ a: recentPlays[i], b: recentPlays[i + 1] });
    }
    return out;
  }, [recentPlays]);

  if (!rows.length) return null;

  return (
    <Box className="px-6 mb-4">
      <VStack className="gap-y-4">
        {rows.map(({ a, b }) => (
          <HStack key={`row-${a.id}`} className="gap-x-4">
            <HomeShortcut recentPlay={a} />
            {b && <HomeShortcut recentPlay={b} />}
          </HStack>
        ))}
      </VStack>
    </Box>
  );
}

export default memo(RecentPlaysSection);
