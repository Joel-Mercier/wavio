import { zustandStorage } from "@/config/storage";
import openSubsonicApiInstance from "@/services/openSubsonic";
import createSelectors from "@/utils/createSelectors";
import z from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const navidromeSubsonicApiVersion =
  process.env.EXPO_PUBLIC_NAVIDROME_SUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_NAVIDROME_CLIENT || "";

export const loginSchema = z.object({
  url: z.url().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

type AuthStore = {
  url: string;
  username: string;
  password: string;
  isAuthenticated: boolean;
  login: (url: string, username: string, password: string) => void;
  logout: () => void;
};

export const useAuthBase = create<AuthStore>()(
  persist(
    (set) => ({
      url: "",
      username: "",
      password: "",
      isAuthenticated: false,
      login: (url: string, username: string, password: string) => {
        openSubsonicApiInstance({
          baseURL: url,
        });
        openSubsonicApiInstance.interceptors.request.use((request) => {
          request.params.u = username;
          request.params.p = password;
          request.params.v = navidromeSubsonicApiVersion;
          request.params.c = navidromeClient;
          request.params.f = "json";
          return request;
        });
        set({ url, username, password, isAuthenticated: true });
      },
      logout: () => {
        openSubsonicApiInstance.interceptors.request.use((request) => {
          request.params = {};
          return request;
        });
        openSubsonicApiInstance({
          baseURL: "",
        });
        set({ url: "", username: "", password: "", isAuthenticated: false });
      },
    }),
    {
      name: "auth",
      storage: createJSONStorage(() => zustandStorage),
      // partialize: (state) =>
      //   Object.fromEntries(
      //     Object.entries(state).filter(([key]) => !['showDrawer'].includes(key)),
      //   ),
    },
  ),
);

const useAuth = createSelectors(useAuthBase);

export default useAuth;
