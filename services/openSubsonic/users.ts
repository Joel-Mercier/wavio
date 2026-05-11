import axios from "axios";
import openSubsonicApiInstance, {
  type OpenSubsonicResponse,
} from "@/services/openSubsonic/index";
import type { User, Users } from "@/services/openSubsonic/types";

export interface UpdateUserParams {
  username: string;
  password?: string;
  email?: string;
  ldapAuthenticated?: boolean;
  adminRole?: boolean;
  settingsRole?: boolean;
  streamRole?: boolean;
  jukeboxRole?: boolean;
  downloadRole?: boolean;
  uploadRole?: boolean;
  playlistRole?: boolean;
  coverArtRole?: boolean;
  commentRole?: boolean;
  podcastRole?: boolean;
  shareRole?: boolean;
  videoConversionRole?: boolean;
  scrobblingEnabled?: boolean;
  musicFolderId?: number | number[];
  maxBitRate?: number;
}

export const getUser = async (username: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ user: User }>
    >("/rest/getUser", {
      params: {
        username,
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

export const getUsers = async () => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ users: Users }>
    >("/rest/getUsers", {
      params: {},
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

export const updateUser = async (params: UpdateUserParams) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/updateUser", {
      params,
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

export const changePassword = async (params: {
  username: string;
  password: string;
}) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/changePassword", {
      params,
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
