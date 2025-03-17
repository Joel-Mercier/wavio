import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";
import type { Shares } from "./types";

export const createShare = async (id: string, { description, expires }: { description?: string, expires?: number }) => {
  const rsp = await openSubsonicApiInstance.post<OpenSubsonicResponse<Shares>>(
    "/rest/createShare",
    {
      id,
      description,
      expires
    }
  );
  return rsp.data;
};

export const deleteShare = async (id: string) => {
  const rsp = await openSubsonicApiInstance.delete<OpenSubsonicResponse<never>>(
    "/rest/deleteShare",
    {
      params: {
        id
      }
    }
  );
  return rsp.data;
};

export const getShares = async () => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<Shares>>(
    "/rest/getShares",
    {
      params: {
      }
    }
  );
  return rsp.data;
};

export const updateShare = async (id: string, { description, expires }: { description?: string, expires?: number }) => {
  const rsp = await openSubsonicApiInstance.put<OpenSubsonicResponse<never>>(
    "/rest/updateShare",
    {
      params: {
        id,
        description,
        expires
      }
    }
  );
  return rsp.data;
};