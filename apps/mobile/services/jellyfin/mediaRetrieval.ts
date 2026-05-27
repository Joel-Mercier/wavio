import jellyfinApiInstance from "@/services/jellyfin/index";
import {
  type JellyfinLyricsResponse,
  mapJellyfinLyrics,
} from "@/services/jellyfin/mappers";
import { fakeEnvelope } from "@/services/jellyfin/unsupported";
import type { Lyrics } from "@/services/openSubsonic/types";
import { useAuthBase } from "@/stores/auth";

export const stream = async (
  _id: string,
  _opts: {
    maxBitRate?: number;
    format?: "mp3" | "flv" | "raw";
    timeOffset?: number;
    size?: string;
    estimateContentLength?: boolean;
    converted?: boolean;
  },
) => "";

export const hls = async (_id: string, _bitRate: number, _audioTrack: string) =>
  "";

export const download = async (_id: string) => "";

export const getAvatar = async (_username: string) => "";

export const getCaptions = async (_id: string, _format: "srt" | "vvt") => "";

export const getCoverArt = async (_id: string, _opts: { size?: number }) => "";

export const getLyrics = async (_opts: { artist?: string; title?: string }) => {
  const lyrics: Lyrics = { value: "" };
  return fakeEnvelope({ lyrics });
};

export const getLyricsBySongId = async (
  id: string,
  _opts: { enhanced?: boolean } = {},
) => {
  try {
    const rsp = await jellyfinApiInstance.get<JellyfinLyricsResponse>(
      `/Audio/${id}/Lyrics`,
    );
    const structured = mapJellyfinLyrics(rsp.data);
    return fakeEnvelope({
      lyricsList: {
        structuredLyrics: structured ? [structured] : [],
      },
    });
  } catch {
    return fakeEnvelope({ lyricsList: { structuredLyrics: [] } });
  }
};
