import openSubsonicApiInstance, {
  type OpenSubsonicResponse,
} from "@/services/openSubsonic/index";
import type { ScanStatus } from "@/services/openSubsonic/types";
import axios from "axios";

export const getScanStatus = async () => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ scanStatus: ScanStatus }>
    >("/rest/getScanStatus", {
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

export const startScan = async () => {
  try {
    const rsp = await openSubsonicApiInstance.post<
      OpenSubsonicResponse<{ scanStatus: ScanStatus }>
    >("/rest/startScan", {});
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
