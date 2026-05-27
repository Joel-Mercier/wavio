import axios from "axios";
import lrclibApiInstance from "@/services/lrclib";
import type { LrclibRecord } from "@/services/lrclib/types";

export async function getLrclibLyrics(params: {
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
}): Promise<LrclibRecord | null> {
  try {
    const response = await lrclibApiInstance.get<LrclibRecord>("/api/get", {
      params: {
        track_name: params.trackName,
        artist_name: params.artistName,
        album_name: params.albumName,
        duration: params.duration,
      },
    });
    return response.data ?? null;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}
