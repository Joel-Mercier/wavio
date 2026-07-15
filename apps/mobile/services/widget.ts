import { DeviceEventEmitter, NativeModules, Platform } from "react-native";
import { getColors } from "react-native-image-colors";
import {
  getPlaybackSnapshot,
  subscribePlaybackState,
} from "@/hooks/player/playbackSnapshot";
import { skipNext, skipPrevious, togglePlayPause } from "@/services/player";
import { currentAuthScope, useAuthBase } from "@/stores/auth";
import useQueue from "@/stores/queue";
import useRecentPlays, { type RecentPlay } from "@/stores/recentPlays";
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
    items: {
      id: string;
      title: string;
      coverUrl: string | null;
      type: string;
      uri: string;
    }[],
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
  // Push the text/artwork straight away with whatever colour we can get for
  // free (a cached palette, else the default). Extracting the dominant colour
  // downloads and decodes the cover, which can take seconds on a cache miss —
  // never make the title/artist wait on it.
  const cachedBg = coverUrl ? bgColorCache.get(coverUrl) : undefined;
  Native.updateNowPlaying({
    title: current.title ?? null,
    artist: current.artist ?? null,
    coverUrl,
    isPlaying,
    bgColor: cachedBg ?? DEFAULT_BG,
  });
  if (cachedBg != null) return;
  // Resolve the palette in the background and push once more when it lands, as
  // long as this is still the current track and the colour beats the default.
  const bgColor = await resolveBgColor(coverUrl);
  if (token !== lastNowPlayingToken || bgColor === DEFAULT_BG) return;
  Native.updateNowPlaying({
    title: current.title ?? null,
    artist: current.artist ?? null,
    coverUrl,
    isPlaying: getPlaybackSnapshot().playing,
    bgColor,
  });
}

// Deep link mirroring HomeShortcut.tsx so a widget tap opens the same screen the
// in-app shortcut would. Radio stations carry their metadata as query params so
// the detail screen can render without a fetch.
function deepLinkFor(play: RecentPlay): string {
  switch (play.type) {
    case "artist":
      return `wavio://artists/${play.id}`;
    case "playlist":
      return `wavio://playlists/${play.id}`;
    case "favorites":
      return "wavio://favorites";
    case "internetRadioStation": {
      const params: [string, string | undefined][] = [
        ["streamUrl", play.streamUrl],
        ["name", play.title],
        ["homePageUrl", play.homePageUrl],
        ["imageUrl", play.coverArt],
        ["tags", play.tags],
        ["country", play.country],
        ["countrySubdivision", play.countrySubdivision],
        ["languages", play.languages],
        ["source", play.source],
      ];
      const query = params
        .filter((entry): entry is [string, string] => !!entry[1])
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join("&");
      const base = `wavio://internet-radio-stations/${play.id}`;
      return query ? `${base}?${query}` : base;
    }
    default:
      return `wavio://albums/${play.id}`;
  }
}

function pushRecent() {
  if (!Native) return;
  const items = useRecentPlays
    .getState()
    .recentPlays.slice(0, 5)
    .map((play) => ({
      id: play.id,
      title: play.title,
      coverUrl:
        play.type === "internetRadioStation"
          ? (play.coverArt ?? null)
          : play.coverArt
            ? artworkUrl(play.coverArt)
            : null,
      type: play.type,
      uri: deepLinkFor(play),
    }));
  Native.updateRecent(items);
}

let initialized = false;
let lastIsPlaying = false;

export function initWidget() {
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

  subscribePlaybackState(() => {
    const playing = getPlaybackSnapshot().playing;
    if (playing === lastIsPlaying) return;
    lastIsPlaying = playing;
    Native.setIsPlaying(playing);
  });

  let lastScope = currentAuthScope();
  useAuthBase.subscribe(() => {
    // Keyed on the scope, not the URL, so a route swap (primary <-> fallback for
    // the same server) doesn't read as a new scope and wipe the widget.
    const scope = currentAuthScope();
    if (scope === lastScope) return;
    lastScope = scope;
    // New (server, user) scope: drop the previous one's now-playing and recent
    // strip rather than leaving them stale on the home screen. The recentPlays
    // rehydrate for the new scope pushes the fresh strip via the subscription
    // below; clear first so the old scope's items don't linger.
    lastTrackId = null;
    void pushNowPlaying();
    Native.updateRecent([]);
    pushRecent();
  });

  useRecentPlays.subscribe(() => {
    pushRecent();
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
  pushRecent();
}
