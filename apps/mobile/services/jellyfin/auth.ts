import axios from "axios";
import { buildAuthorizationHeader } from "@/services/jellyfin/index";

export type JellyfinAuthResponse = {
  AccessToken: string;
  ServerId: string;
  User: {
    Id: string;
    Name: string;
    Policy?: { IsAdministrator?: boolean };
  };
};

export const authenticateByName = async (
  url: string,
  username: string,
  password: string,
): Promise<JellyfinAuthResponse> => {
  const baseURL = url.replace(/\/+$/, "");
  const rsp = await axios
    .create({
      baseURL,
      headers: {
        "Content-Type": "application/json",
        "X-Emby-Authorization": buildAuthorizationHeader(null),
      },
    })
    .post<JellyfinAuthResponse>("/Users/AuthenticateByName", {
      Username: username,
      Pw: password,
    });
  return rsp.data;
};

export type JellyfinSystemInfo = {
  ServerName: string;
  Version: string;
  Id: string;
  OperatingSystem?: string;
};

export const getSystemInfo = async (
  url: string,
): Promise<JellyfinSystemInfo> => {
  const baseURL = url.replace(/\/+$/, "");
  const rsp = await axios
    .create({
      baseURL,
      headers: {
        "Content-Type": "application/json",
        "X-Emby-Authorization": buildAuthorizationHeader(null),
      },
    })
    .get<JellyfinSystemInfo>("/System/Info/Public");
  return rsp.data;
};
