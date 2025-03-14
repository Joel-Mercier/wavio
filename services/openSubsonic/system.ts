import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";
import type { License, OpenSubsonicExtensions } from "./types";

export const getLicense = async () => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<License>>(
    "/rest/getLicense",
    {
      params: {
      }
    }
  );
  return rsp.data;
};

export const getOpenSubsonicExtensions = async () => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<OpenSubsonicExtensions>>(
    "/rest/getOpenSubsonicExtensions",
    {
      params: {
      }
    }
  );
  return rsp.data;
};

export const ping = async () => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<never>>(
    "/rest/ping",
    {
      params: {
      }
    }
  );
  return rsp.data;
};
