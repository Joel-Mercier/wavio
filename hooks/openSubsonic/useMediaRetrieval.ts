import {
  stream,
  download,
  getAvatar,
  getCaptions,
  getCoverArt,
  getLyrics,
  getLyricsBySongId,
  hls,
} from "@/services/openSubsonic/mediaRetrieval";
import { useQuery } from "@tanstack/react-query";

export const useDownload = (id: string) => {
  return useQuery({
    queryKey: ["download", id],
    queryFn: () => {
      return download(id);
    },
  });
};

export const useGetAvatar = (username: string) => {
  return useQuery({
    queryKey: ["getAvatar", username],
    queryFn: () => {
      return getAvatar(username);
    },
  });
};

export const useGetCaptions = (
  id: string,
  { format }: { format: "srt" | "vvt" },
) => {
  return useQuery({
    queryKey: ["getCaptions", id, format],
    queryFn: () => {
      return getCaptions(id, format);
    },
  });
};

export const useGetCoverArt = (
  id: string,
  params: { size?: number },
  enabled = true,
) => {
  return useQuery({
    queryKey: ["getCoverArt", id, params],
    queryFn: () => {
      return getCoverArt(id, params);
    },
    enabled,
  });
};

export const useGetLyrics = (params: { artist?: string; title?: string }) => {
  return useQuery({
    queryKey: ["getLyrics", params],
    queryFn: () => {
      return getLyrics(params);
    },
  });
};

export const useGetLyricsBySongId = (id: string) => {
  return useQuery({
    queryKey: ["getLyricsBySongId", id],
    queryFn: () => {
      return getLyricsBySongId(id);
    },
  });
};

export const useHls = (id: string, bitRate: number, audioTrack: string) => {
  return useQuery({
    queryKey: ["hls", id, bitRate, audioTrack],
    queryFn: () => {
      return hls(id, bitRate, audioTrack);
    },
  });
};

export const useStream = (
  id: string,
  params: {
    maxBitRate?: number;
    format?: "mp3" | "flv" | "raw";
    timeOffset?: number;
    size?: string;
    estimateContentLength?: boolean;
    converted?: boolean;
  },
) => {
  return useQuery({
    queryKey: ["stream", id, params],
    queryFn: () => {
      return stream(id, params);
    },
  });
};
