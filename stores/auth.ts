import * as z from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";

export const loginSchema = z.object({
  url: z.url().min(1).trim(),
  username: z.string().min(1).trim(),
  password: z.string().min(1).trim(),
});

export type NavidromeNativeSession = {
  token: string;
  userId: string;
  isAdmin: boolean;
};

type AuthStore = {
  url: string;
  username: string;
  password: string;
  isAuthenticated: boolean;
  token: string | null;
  userId: string | null;
  isAdmin: boolean;
  hasNavidromeNative: boolean;
  login: (
    url: string,
    username: string,
    password: string,
    navidrome?: NavidromeNativeSession | null,
  ) => void;
  setNavidromeSession: (session: NavidromeNativeSession | null) => void;
  setToken: (token: string) => void;
  setPassword: (password: string) => void;
  logout: () => void;
};

export const useAuthBase = create<AuthStore>()(
  persist(
    (set) => ({
      url: "",
      username: "",
      password: "",
      isAuthenticated: false,
      token: null,
      userId: null,
      isAdmin: false,
      hasNavidromeNative: false,
      login: (
        url: string,
        username: string,
        password: string,
        navidrome?: NavidromeNativeSession | null,
      ) => {
        set({
          url: url.trim(),
          username: username.trim(),
          password: password.trim(),
          isAuthenticated: true,
          token: navidrome?.token ?? null,
          userId: navidrome?.userId ?? null,
          isAdmin: navidrome?.isAdmin ?? false,
          hasNavidromeNative: !!navidrome,
        });
      },
      setNavidromeSession: (session: NavidromeNativeSession | null) => {
        set({
          token: session?.token ?? null,
          userId: session?.userId ?? null,
          isAdmin: session?.isAdmin ?? false,
          hasNavidromeNative: !!session,
        });
      },
      setToken: (token: string) => {
        set({ token });
      },
      setPassword: (password: string) => {
        set({ password });
      },
      logout: () => {
        set({
          url: "",
          username: "",
          password: "",
          isAuthenticated: false,
          token: null,
          userId: null,
          isAdmin: false,
          hasNavidromeNative: false,
        });
      },
    }),
    {
      name: "auth",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

const useAuth = createSelectors(useAuthBase);

export default useAuth;
