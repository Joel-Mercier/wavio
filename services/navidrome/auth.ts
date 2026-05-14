import axios from "axios";
import type { NavidromeAuthPayload } from "@/services/navidrome/types";

export const nativeLogin = async (
  url: string,
  username: string,
  password: string,
): Promise<NavidromeAuthPayload> => {
  const baseURL = url.replace(/\/+$/, "");
  const rsp = await axios
    .create({
      baseURL,
      headers: { "Content-Type": "application/json" },
    })
    .post<NavidromeAuthPayload>("/auth/login", { username, password });
  return rsp.data;
};
