import * as z from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { queryClient } from "@/config/queryClient";
import { zustandStorage } from "@/config/storage";
import { useServerExtensionsBase } from "@/stores/serverExtensions";
import { type ServerType, serverTypeSchema } from "@/stores/servers";
import createSelectors from "@/utils/createSelectors";

// Side effects to run when the active session is torn down (logout / server
// switch). Lets modules with no import-safe link to the auth store — notably
// services/player.ts — hook into logout without creating an import cycle.
let logoutHandlers: Array<() => void> = [];
export function registerLogoutHandler(handler: () => void): () => void {
  logoutHandlers.push(handler);
  return () => {
    logoutHandlers = logoutHandlers.filter((h) => h !== handler);
  };
}

// `local` servers have no URL or credentials — only filesystem paths picked in
// the UI — so those fields are validated only for remote server types. Errors
// are forwarded at the field path with their locale-aware messages so the login
// form still highlights the right input for remote logins.
export const loginSchema = z
  .object({
    url: z.string().trim(),
    username: z.string().trim(),
    password: z.string().trim(),
    type: serverTypeSchema,
    // Local-server source folders; only relevant when `type === "local"`. The
    // login form always supplies this (defaults to []), so it's required here to
    // match the form's value shape for the StandardSchema validator.
    paths: z.array(z.string()),
  })
  .superRefine((data, ctx) => {
    if (data.type === "local") return;
    const url = z.url().min(1).trim().safeParse(data.url);
    if (!url.success) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: url.error.issues[0]?.message,
      });
    }
    const username = z.string().min(1).trim().safeParse(data.username);
    if (!username.success) {
      ctx.addIssue({
        code: "custom",
        path: ["username"],
        message: username.error.issues[0]?.message,
      });
    }
    const password = z.string().min(1).trim().safeParse(data.password);
    if (!password.success) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: password.error.issues[0]?.message,
      });
    }
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
  subsonicSalt: string | null;
  subsonicToken: string | null;
  login: (
    url: string,
    username: string,
    password: string,
    options?: {
      serverType?: ServerType;
      navidrome?: NavidromeNativeSession | null;
      jellyfin?: JellyfinSession | null;
      subsonicSalt?: string | null;
      subsonicToken?: string | null;
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
      subsonicSalt: null,
      subsonicToken: null,
      login: (
        url: string,
        username: string,
        password: string,
        options?: {
          serverType?: ServerType;
          navidrome?: NavidromeNativeSession | null;
          jellyfin?: JellyfinSession | null;
          subsonicSalt?: string | null;
          subsonicToken?: string | null;
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
          userId: jellyfin?.userId ?? navidrome?.userId ?? null,
          isAdmin: jellyfin?.isAdmin ?? navidrome?.isAdmin ?? false,
          hasNavidromeNative: !!navidrome,
          jellyfinAccessToken: jellyfin?.accessToken ?? null,
          jellyfinUserId: jellyfin?.userId ?? null,
          subsonicSalt: options?.subsonicSalt ?? null,
          subsonicToken: options?.subsonicToken ?? null,
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
        // Tear down playback (stop audio, clear the now-playing notification and
        // the queue) before credentials and caches are wiped, so nothing keeps
        // playing or tries to talk to the server we're leaving.
        for (const handler of logoutHandlers) {
          try {
            handler();
          } catch {}
        }
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
          subsonicSalt: null,
          subsonicToken: null,
        });
        // Wipe every cached server response so reconnecting to a different
        // server (or user) never shows stale content that isn't backed by a
        // zustand store. Cancel in-flight queries first so their results can't
        // repopulate the cache after it's cleared.
        queryClient.cancelQueries();
        queryClient.clear();
        // Forget the previous server's advertised OpenSubsonic extensions.
        useServerExtensionsBase.getState().reset();
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
