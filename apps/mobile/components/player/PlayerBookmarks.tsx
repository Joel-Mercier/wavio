import { LinearGradient } from "expo-linear-gradient";
import Bookmark from "lucide-react-native/dist/esm/icons/bookmark.mjs";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { usePlayingTrack } from "@/hooks/player";
import { useTrackBookmarks } from "@/hooks/useTrackBookmarks";
import { seekTo } from "@/services/player";
import useApp from "@/stores/app";
import useBookmarks from "@/stores/bookmarks";
import { formatSeconds } from "@/utils/date";
import { cn } from "@/utils/tailwind";

// Matches the player background gradient's bottom color so the edge fades blend
// into it (the player bg ends at #191A1F).
const PLAYER_BG_BOTTOM = "#191A1F";

// The row height is reserved even when there are no bookmarks so the flex-1
// cover art above keeps a constant size instead of resizing as bookmarks
// appear/disappear between tracks.
const BOOKMARK_ROW_HEIGHT = 32;

export default function PlayerBookmarks() {
  const track = usePlayingTrack();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const bookmarks = useTrackBookmarks(track?.id);
  const hasBookmarks = !!track?.id && bookmarks.length > 0;

  // Actions are stable references, so read from getState() instead of
  // subscribing — keeps the hook list fixed regardless of render path.
  const { removeBookmark } = useBookmarks.getState();

  return (
    <Box
      className={cn("relative -mx-6", isWideLayout ? "mt-2" : "mt-6")}
      style={{ height: BOOKMARK_ROW_HEIGHT }}
    >
      {hasBookmarks && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24 }}
          >
            <HStack className="items-center gap-x-2 h-full">
              {bookmarks.map((position) => (
                <FadeOutScaleDown
                  key={position}
                  onPress={() => seekTo(position)}
                  onLongPress={() => removeBookmark(track.id, position)}
                >
                  <Badge className="rounded-full bg-gray-800 px-3 py-1 flex-row items-center gap-x-1">
                    <Bookmark size={12} color="#10b981" fill="#10b981" />
                    <BadgeText className="normal-case text-md text-white">
                      {formatSeconds(position)}
                    </BadgeText>
                  </Badge>
                </FadeOutScaleDown>
              ))}
            </HStack>
          </ScrollView>
          <LinearGradient
            colors={[PLAYER_BG_BOTTOM, "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 24,
            }}
          />
          <LinearGradient
            colors={["transparent", PLAYER_BG_BOTTOM]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            pointerEvents="none"
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 24,
            }}
          />
        </>
      )}
    </Box>
  );
}
