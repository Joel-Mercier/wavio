import axios from "axios";
import { useAuthBase } from "@/stores/auth";

export const NAVIDROME_AUTH_HEADER = "X-ND-Authorization";

const navidromeApiInstance = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
});

navidromeApiInstance.interceptors.request.use(
  (request) => {
    const { url, token } = useAuthBase.getState();
    request.baseURL = url ? `${url.replace(/\/+$/, "")}/api` : "";
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
      request.headers.set(NAVIDROME_AUTH_HEADER, `Bearer ${token}`);
    }
    return request;
  },
  (error) => {
    console.error(error);
    return Promise.reject(error);
  },
);

navidromeApiInstance.interceptors.response.use(
  (response) => {
    const refreshed =
      (response.headers?.[NAVIDROME_AUTH_HEADER.toLowerCase()] as
        | string
        | undefined) ??
      (response.headers?.[NAVIDROME_AUTH_HEADER] as string | undefined);
    if (refreshed && typeof refreshed === "string" && refreshed.length > 0) {
      const next = refreshed.startsWith("Bearer ")
        ? refreshed.slice(7)
        : refreshed;
      const current = useAuthBase.getState().token;
      if (next && next !== current) {
        useAuthBase.getState().setToken(next);
      }
    }
    return response;
  },
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      useAuthBase.getState().setNavidromeSession(null);
    }
    return Promise.reject(error);
  },
);

export default navidromeApiInstance;
