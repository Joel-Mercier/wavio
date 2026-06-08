import axios from "axios";
import openSubsonicApiInstance, {
  type OpenSubsonicResponse,
} from "@/services/openSubsonic/index";

export const scrobble = async (
  id: string,
  { time, submission }: { time?: number; submission?: boolean },
) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/scrobble", {
      params: {
        id,
        time,
        submission,
      },
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

// OpenSubsonic `playbackReport` extension (Navidrome v0.62.0). Reports playback
// state/position so the server drives scrobbling and enriches getNowPlaying.
export type PlaybackReportState = "starting" | "playing" | "paused" | "stopped";

export const reportPlayback = async ({
  mediaId,
  mediaType = "song",
  positionMs,
  state,
  playbackRate,
  ignoreScrobble,
}: {
  mediaId: string;
  // Required by Navidrome's handler — a missing mediaType makes every call fail
  // (the request still 200s at the HTTP layer but returns a Subsonic error and
  // nothing is recorded). The player only reports songs (podcasts are excluded).
  mediaType?: "song" | "podcast";
  positionMs: number;
  state: PlaybackReportState;
  playbackRate?: number;
  ignoreScrobble?: boolean;
}) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/reportPlayback", {
      params: {
        mediaId,
        mediaType,
        positionMs,
        state,
        playbackRate,
        ignoreScrobble,
      },
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const setRating = async (id: string, rating: number) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/setRating", {
      params: {
        id,
        rating,
      },
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const star = async ({
  id,
  albumId,
  artistId,
}: {
  id?: string;
  albumId?: string;
  artistId?: string;
}) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/star", {
      params: {
        id,
        albumId,
        artistId,
      },
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const unstar = async ({
  id,
  albumId,
  artistId,
}: {
  id?: string;
  albumId?: string;
  artistId?: string;
}) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/unstar", {
      params: {
        id,
        albumId,
        artistId,
      },
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};
