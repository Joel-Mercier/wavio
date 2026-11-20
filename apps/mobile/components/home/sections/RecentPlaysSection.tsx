import type { TFunction } from "i18next";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import HomeShortcut from "@/components/home/HomeShortcut";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { useIsPlaying } from "@/hooks/player";
import { usePlaylistFolderOptions } from "@/hooks/usePlaylistFolderOptions";
import useApp from "@/stores/app";
import useQueue from "@/stores/queue";
import useRecentPlays, { type RecentPlay } from "@/stores/recentPlays";
import { activeRecentPlayKey, recentPlayKey } from "@/utils/activeRecentPlay";
import {
  type PlaylistFolderOptions,
  playlistTitleInFolder,
} from "@/utils/playlistFolders";

type Shortcut = { recentPlay: RecentPlay; title: string };

function shortcutTitle(
  recentPlay: RecentPlay,
  folderOptions: PlaylistFolderOptions,
  t: TFunction,
) {
  switch (recentPlay.type) {
    case "favorites":
      return t("app.favorites.title");
    case "playlist":
      return playlistTitleInFolder(
        { id: recentPlay.id, name: recentPlay.title },
        folderOptions,
      );
    default:
      return recentPlay.title;
  }
}

function RecentPlaysSection() {
  const { t } = useTranslation();
  const recentPlays = useRecentPlays((store) => store.recentPlays);
  const homeShortcutsCount = useApp((store) => store.homeShortcutsCount);
  const activeKey = useQueue((store) =>
    activeRecentPlayKey(
      store.source,
      store.currentIndex != null ? store.queue[store.currentIndex] : null,
    ),
  );
  const isPlaying = useIsPlaying();
  const folderOptions = usePlaylistFolderOptions();
  const rows = useMemo(() => {
    const shown: Shortcut[] = recentPlays
      .slice(0, homeShortcutsCount)
      .map((recentPlay) => ({
        recentPlay,
        title: shortcutTitle(recentPlay, folderOptions, t),
      }));
    const out: { a: Shortcut; b?: Shortcut }[] = [];
    for (let i = 0; i < shown.length; i += 2) {
      out.push({ a: shown[i], b: shown[i + 1] });
    }
    return out;
  }, [recentPlays, homeShortcutsCount, folderOptions, t]);

  if (!rows.length) return null;

  const renderShortcut = ({ recentPlay, title }: Shortcut) => {
    const isActive = recentPlayKey(recentPlay) === activeKey;
    return (
      <HomeShortcut
        recentPlay={recentPlay}
        title={title}
        isActive={isActive}
        playing={isActive && isPlaying}
      />
    );
  };

  return (
    <Box className="px-6 mb-4">
      <VStack className="gap-y-4">
        {rows.map(({ a, b }) => (
          <HStack key={`row-${a.recentPlay.id}`} className="gap-x-4">
            {renderShortcut(a)}
            {b && renderShortcut(b)}
          </HStack>
        ))}
      </VStack>
    </Box>
  );
}

export default memo(RecentPlaysSection);
