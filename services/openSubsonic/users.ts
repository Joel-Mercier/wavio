import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";
import type { User, Users } from "./types";

export const getUser = async (username: string) => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<User>>(
    "/rest/getUser",
    {
      params: {
        username
      }
    }
  );
  return rsp.data;
};

export const getUsers = async () => {
  const rsp = await openSubsonicApiInstance.get<OpenSubsonicResponse<Users>>(
    "/rest/getUsers",
    {
      params: {
      }
    }
  );
  return rsp.data;
};