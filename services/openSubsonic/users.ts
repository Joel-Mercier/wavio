import axios from "axios";
import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";
import type { User, Users } from "./types";

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
