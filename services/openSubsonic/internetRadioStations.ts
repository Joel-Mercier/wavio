import openSubsonicApiInstance, {
  type OpenSubsonicResponse,
} from "@/services/openSubsonic/index";
import type { InternetRadioStation } from "@/services/openSubsonic/types";
import axios from "axios";

export const createInternetRadioStation = async (
  streamUrl: string,
  name: string,
  homePageUrl?: string,
) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ radioStation: InternetRadioStation }>
    >("/rest/createInternetRadioStation", {
      params: {
        streamUrl,
        name,
        homepageUrl: homePageUrl,
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

export const getInternetRadioStations = async () => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{
        internetRadioStations: { internetRadioStation: InternetRadioStation[] };
      }>
    >("/rest/getInternetRadioStations", {
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

export const deleteInternetRadioStation = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/deleteInternetRadioStation", {
      params: {
        id,
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

export const updateInternetRadioStation = async (
  id: string,
  {
    streamUrl,
    name,
    homePageUrl,
  }: { streamUrl: string; name: string; homePageUrl?: string },
) => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/updateInternetRadioStation", {
      params: {
        id,
        streamUrl,
        name,
        homePageUrl,
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
