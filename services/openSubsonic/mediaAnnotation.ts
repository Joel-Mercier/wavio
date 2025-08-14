import axios from "axios";
import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";

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
}: { id?: string; albumId?: string; artistId?: string }) => {
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
}: { id?: string; albumId?: string; artistId?: string }) => {
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
