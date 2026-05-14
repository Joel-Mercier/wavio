import type { QueryClient } from "@tanstack/react-query";
import { DeviceEventEmitter, NativeModules, Platform } from "react-native";
import { getColors } from "react-native-image-colors";
import {
  getPlaybackSnapshot,
  subscribePlaybackStatus,
} from "@/hooks/player/playbackSnapshot";
import type { AlbumID3, AlbumList2 } from "@/services/openSubsonic/types";
import { skipNext, skipPrevious, togglePlayPause } from "@/services/player";
import useQueue from "@/stores/queue";
import { artworkUrl } from "@/utils/artwork";

type WidgetNative = {
  updateNowPlaying: (payload: {
    title: string | null;
    artist: string | null;
    coverUrl: string | null;
    isPlaying: boolean;
    bgColor: number;
  }) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  updateRecent: (
    items: { id: string; title: string; coverUrl: string | null }[],
  ) => void;
};

const Native: WidgetNative | null =
  Platform.OS === "android" && NativeModules.WavioWidget
    ? (NativeModules.WavioWidget as WidgetNative)
    : null;

const DEFAULT_BG = 0xff000000 | 0;

const parseHexColor = (hex?: string): number => {
  if (!hex) return DEFAULT_BG;
  const clean = hex.replace("#", "");
  const value =
    clean.length === 6
      ? Number.parseInt(`ff${clean}`, 16)
      : clean.length === 8
        ? Number.parseInt(clean, 16)
        : Number.NaN;
  if (!Number.isFinite(value)) return DEFAULT_BG;
  return value | 0;
};

const bgColorCache = new Map<string, number>();
async function resolveBgColor(coverUrl: string | null): Promise<number> {
  if (!coverUrl) return DEFAULT_BG;
  const cached = bgColorCache.get(coverUrl);
  if (cached != null) return cached;
  try {
    const result = await getColors(coverUrl, {
      fallback: "#000000",
      cache: true,
      key: coverUrl,
    });
    let hex: string | undefined;
    if (result.platform === "android") {
      hex = result.darkMuted ?? result.darkVibrant ?? result.dominant;
    } else if (result.platform === "ios") {
      hex = result.background ?? result.primary;
    }
    const color = parseHexColor(hex);
    bgColorCache.set(coverUrl, color);
    return color;
  } catch {
    return DEFAULT_BG;
  }
}

let lastTrackId: string | null = null;
let lastNowPlayingToken = 0;

async function pushNowPlaying() {
  if (!Native) return;
  const current = useQueue.getState().getCurrent();
  const token = ++lastNowPlayingToken;
  if (!current) {
    Native.updateNowPlaying({
      title: null,
      artist: null,
      coverUrl: null,
      isPlaying: false,
      bgColor: DEFAULT_BG,
    });
    return;
  }
  const coverUrl =
    (typeof current.artwork === "string" && current.artwork) ||
    (typeof current.coverArt === "string" && current.coverArt
      ? artworkUrl(current.coverArt)
      : null) ||
    null;
  const isPlaying = getPlaybackSnapshot().playing;
  const bgColor = await resolveBgColor(coverUrl);
  if (token !== lastNowPlayingToken) return;
  Native.updateNowPlaying({
    title: current.title ?? null,
    artist: current.artist ?? null,
    coverUrl,
    isPlaying,
    bgColor,
  });
}

function albumsFromQueryCache(queryClient: QueryClient): AlbumID3[] {
  const matches = queryClient
    .getQueryCache()
    .findAll({ queryKey: ["albumList2"] });
  for (const q of matches) {
    const key = q.queryKey as [string, { type?: string } | undefined];
    if (key[1]?.type !== "recent") continue;
    const data = q.state.data as { albumList2?: AlbumList2 } | undefined;
    const albums = data?.albumList2?.album;
    if (albums?.length) return albums;
  }
  return [];
}

function pushRecent(queryClient: QueryClient) {
  if (!Native) return;
  const albums = albumsFromQueryCache(queryClient);
  const items = albums
    .filter((a) => !!a.coverArt)
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      title: a.name,
      coverUrl: a.coverArt ? artworkUrl(a.coverArt) : null,
    }));
  Native.updateRecent(items);
}

let initialized = false;
let lastIsPlaying = false;

export function initWidget(queryClient: QueryClient) {
  if (Platform.OS !== "android" || !Native || initialized) return;
  initialized = true;

  useQueue.subscribe((state) => {
    const current =
      state.currentIndex != null ? state.queue[state.currentIndex] : null;
    const id = current?.id ?? null;
    if (id === lastTrackId) return;
    lastTrackId = id;
    void pushNowPlaying();
  });

  subscribePlaybackStatus(() => {
    const playing = getPlaybackSnapshot().playing;
    if (playing === lastIsPlaying) return;
    lastIsPlaying = playing;
    Native.setIsPlaying(playing);
  });

  queryClient.getQueryCache().subscribe((event) => {
    const key = event.query.queryKey as
      | [string, { type?: string } | undefined]
      | undefined;
    if (!key || key[0] !== "albumList2" || key[1]?.type !== "recent") return;
    pushRecent(queryClient);
  });

  DeviceEventEmitter.addListener("WavioWidgetControl", (action: string) => {
    switch (action) {
      case "play_pause":
        togglePlayPause();
        break;
      case "next":
        skipNext();
        break;
      case "prev":
        skipPrevious();
        break;
    }
  });

  void pushNowPlaying();
  pushRecent(queryClient);
}
