import jellyfinApiInstance from "@/services/jellyfin/index";
import { fakeEnvelope } from "@/services/jellyfin/unsupported";
import type { Bookmarks, PlayQueue } from "@/services/openSubsonic/types";
import { useAuthBase } from "@/stores/auth";

// Subsonic bookmarks ≈ Jellyfin UserData.PlaybackPositionTicks. We can
// approximate single-item bookmarks but not the full Subsonic semantics
// (comments, multi-item index). v1 of the Jellyfin adapter ignores these
// flows; the UI capability flag will hide bookmark-driven surfaces.

export const createBookmark = async (
  id: string,
  position: number,
  _opts: { comment?: string },
) => {
  await jellyfinApiInstance.post("/Sessions/Playing/Progress", {
    ItemId: id,
    PositionTicks: position * 10_000_000,
    IsPaused: true,
    CanSeek: true,
  });
  return fakeEnvelope({});
};

export const deleteBookmark = async (_id: string) => fakeEnvelope({});

export const getBookmarks = async () => {
  const bookmarks: Bookmarks = { bookmark: [] };
  return fakeEnvelope({ bookmarks });
};

export const getPlayQueue = async () => {
  const playQueue: PlayQueue = {
    username: useAuthBase.getState().username,
    changed: new Date(),
    changedBy: "wavio",
    entry: [],
  };
  return fakeEnvelope({ playQueue });
};

export const savePlayQueue = async (_opts: {
  ids?: string[];
  current?: string;
  position?: number;
}) => fakeEnvelope({});
