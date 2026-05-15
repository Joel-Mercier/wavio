import * as z from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "@/config/storage";
import { type ServerType, serverTypeSchema } from "@/stores/servers";
import createSelectors from "@/utils/createSelectors";

export const loginSchema = z.object({
  url: z.url().min(1).trim(),
  username: z.string().min(1).trim(),
  password: z.string().min(1).trim(),
  type: serverTypeSchema,
});

export type NavidromeNativeSession = {
  token: string;
  userId: string;
  isAdmin: boolean;
};

export type JellyfinSession = {
  accessToken: string;
  userId: string;
  isAdmin: boolean;
};

type AuthStore = {
  url: string;
  username: string;
  password: string;
  isAuthenticated: boolean;
  serverType: ServerType;
  token: string | null;
  userId: string | null;
  isAdmin: boolean;
  hasNavidromeNative: boolean;
  jellyfinAccessToken: string | null;
  jellyfinUserId: string | null;
  serverVersion: string | null;
  login: (
    url: string,
    username: string,
    password: string,
    options?: {
      serverType?: ServerType;
      navidrome?: NavidromeNativeSession | null;
      jellyfin?: JellyfinSession | null;
    },
  ) => void;
  setNavidromeSession: (session: NavidromeNativeSession | null) => void;
  setJellyfinSession: (session: JellyfinSession | null) => void;
  setServerType: (type: ServerType) => void;
  setToken: (token: string) => void;
  setPassword: (password: string) => void;
  setServerVersion: (version: string | null) => void;
  logout: () => void;
};

export const useAuthBase = create<AuthStore>()(
  persist(
    (set) => ({
      url: "",
      username: "",
      password: "",
      isAuthenticated: false,
      serverType: "navidrome",
      token: null,
      userId: null,
      isAdmin: false,
      hasNavidromeNative: false,
      jellyfinAccessToken: null,
      jellyfinUserId: null,
      serverVersion: null,
      login: (
        url: string,
        username: string,
        password: string,
        options?: {
          serverType?: ServerType;
          navidrome?: NavidromeNativeSession | null;
          jellyfin?: JellyfinSession | null;
        },
      ) => {
        const serverType = options?.serverType ?? "navidrome";
        const navidrome = options?.navidrome ?? null;
        const jellyfin = options?.jellyfin ?? null;
        set({
          url: url.trim(),
          username: username.trim(),
          password: password.trim(),
          isAuthenticated: true,
          serverType,
          token: navidrome?.token ?? null,
          userId:
            jellyfin?.userId ?? navidrome?.userId ?? null,
          isAdmin:
            jellyfin?.isAdmin ?? navidrome?.isAdmin ?? false,
          hasNavidromeNative: !!navidrome,
          jellyfinAccessToken: jellyfin?.accessToken ?? null,
          jellyfinUserId: jellyfin?.userId ?? null,
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
      setJellyfinSession: (session: JellyfinSession | null) => {
        set({
          jellyfinAccessToken: session?.accessToken ?? null,
          jellyfinUserId: session?.userId ?? null,
          userId: session?.userId ?? null,
          isAdmin: session?.isAdmin ?? false,
        });
      },
      setServerType: (type: ServerType) => {
        set({ serverType: type });
      },
      setToken: (token: string) => {
        set({ token });
      },
      setPassword: (password: string) => {
        set({ password });
      },
      setServerVersion: (version: string | null) => {
        set({ serverVersion: version });
      },
      logout: () => {
        set({
          url: "",
          username: "",
          password: "",
          isAuthenticated: false,
          serverType: "navidrome",
          token: null,
          userId: null,
          isAdmin: false,
          hasNavidromeNative: false,
          jellyfinAccessToken: null,
          jellyfinUserId: null,
          serverVersion: null,
        });
      },
    }),
    {
      name: "auth",
      storage: createJSONStorage(() => zustandStorage),
      version: 2,
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<AuthStore> | undefined;
        if (!state || version >= 2) return persistedState as AuthStore;
        return {
          ...state,
          serverType: state.serverType ?? "navidrome",
          jellyfinAccessToken: state.jellyfinAccessToken ?? null,
          jellyfinUserId: state.jellyfinUserId ?? null,
        } as AuthStore;
      },
    },
  ),
);

const useAuth = createSelectors(useAuthBase);

export default useAuth;
