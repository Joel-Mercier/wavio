import { arrayBufferToBase64 } from "@/utils/arrayBufferToBase64";
import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";
import type { Lyrics, StructuredLyrics } from "./types";

export const download = async (id: string) => {
  const rsp = await openSubsonicApiInstance.get<string>("/rest/download", {
    params: {
      id,
    },
  });
  return rsp.data;
};

export const getAvatar = async (username: string) => {
  const rsp = await openSubsonicApiInstance.get<string>("/rest/getAvatar", {
    params: {
      username,
    },
  });
  return rsp.data;
};

export const getCaptions = async (id: string, format: "srt" | "vvt") => {
  const rsp = await openSubsonicApiInstance.get<string>("/rest/getCaptions", {
    params: {
      id,
      format,
    },
  });

  return rsp.data;
};

export const getCoverArt = async (id: string, { size }: { size?: number }) => {
  const rsp = await openSubsonicApiInstance.get("/rest/getCoverArt", {
    responseType: "arraybuffer",
    responseEncoding: "base64",
    params: {
      id,
      size,
    },
  });

  return arrayBufferToBase64(rsp.data)
};

export const getLyrics = async ({
  artist,
  title,
}: { artist?: string; title?: string }) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<Lyrics>>(
    "/rest/getLyrics",
    {
      params: {
        artist,
        title,
      },
    },
  );
  return rsp.data;
};

export const getLyricsBySongId = async (id: string) => {
  const rsp = await openSubsonicApiInstance.get<
    OpenSubsonicResponse<StructuredLyrics>
  >("/rest/getLyricsBySongId", {
    params: {
      id,
    },
  });
  return rsp.data;
};

export const hls = async (id: string, bitRate: number, audioTrack: string) => {
  const rsp = await openSubsonicApiInstance.get<string>("/rest/hls", {
    params: {
      id,
      bitRate,
      audioTrack,
    },
  });
  return rsp.data;
};

export const stream = async (
  id: string,
  {
    maxBitRate,
    format,
    timeOffset,
    size,
    estimateContentLength,
    converted,
  }: {
    maxBitRate?: number;
    format?: "mp3" | "flv" | "raw";
    timeOffset?: number;
    size?: string;
    estimateContentLength?: boolean;
    converted?: boolean;
  },
) => {
  const rsp = await openSubsonicApiInstance.get<string>("/rest/stream", {
    params: {
      id,
      maxBitRate,
      format,
      timeOffset,
      size,
      estimateContentLength,
      converted,
    },
  });
  return rsp.data;
};
