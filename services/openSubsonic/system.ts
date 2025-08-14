import axios from "axios";
import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";
import type { License, OpenSubsonicExtensions } from "./types";

export const getLicense = async () => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ license: License }>
    >("/rest/getLicense", {
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

export const getOpenSubsonicExtensions = async () => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ openSubsonicExtensions: OpenSubsonicExtensions }>
    >("/rest/getOpenSubsonicExtensions", {
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

export const ping = async () => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/ping", {
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
