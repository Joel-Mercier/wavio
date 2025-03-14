import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";
import type { ScanStatus } from "./types";

export const getScanStatus = async () => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<ScanStatus>>(
    "/rest/getScanStatus",
    {
      params: {
      }
    }
  );
  return rsp.data;
};

export const startScan = async () => {
  const rsp = await openSubsonicApiInstance.post<OpenSubsonicResponse<ScanStatus>>(
    "/rest/startScan",
    {

    }
  );
  return rsp.data;
};