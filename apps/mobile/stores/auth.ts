import * as z from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getAuthScope, LOCAL_AUTH_SCOPE } from "@/config/authScope";
import { queryClient } from "@/config/queryClient";
import { zustandStorage } from "@/config/storage";
import { useServerExtensionsBase } from "@/stores/serverExtensions";
import {
  refineFallbackUrl,
  type ServerType,
  serverTypeSchema,
} from "@/stores/servers";
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
    // Android KeyChain alias for mTLS client-cert auth (remote types, Android
    // only); presence enables mTLS. Required (empty = none) so the inferred
    // input type matches the login form's string default; no refinement.
    mtlsAlias: z.string().trim(),
    // Optional alternative address for the same server (remote types only).
    // Required-but-empty for the same reason as `mtlsAlias`.
    fallbackUrl: z.string().trim(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "local") return;
    refineFallbackUrl(data.fallbackUrl, ctx);
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

export type LoginOptions = {
  serverType?: ServerType;
  navidrome?: NavidromeNativeSession | null;
  jellyfin?: JellyfinSession | null;
  subsonicSalt?: string | null;
  subsonicToken?: string | null;
  useTokenAuth?: boolean;
};

export type LoginParams = LoginOptions & {
  // Identity of the server row this session belongs to. Together with
  // `username` it forms the storage scope (see config/storage.ts), so it must
  // always be a real `Server.id` — an empty value would bucket the session into
  // a shared, colliding scope.
  serverId: string;
  // The route this session talks to. Unlike `serverId` this is free to change
  // (see the fallback URL failover in services/network.ts) and is deliberately
  // NOT part of the storage scope.
  url: string;
  username: string;
  password: string;
};

type AuthStore = {
  serverId: string;
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
  // Whether this session authenticates with Subsonic token+salt (`t`/`s`) or
  // falls back to password auth (`p`) for servers that reject token auth
  // (OpenSubsonic error 41/42, e.g. LMS/Lyrion's Subsonic bridge).
  useTokenAuth: boolean;
  login: (params: LoginParams) => void;
  setActiveUrl: (url: string) => void;
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
      serverId: "",
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
      useTokenAuth: true,
      login: ({
        serverId,
        url,
        username,
        password,
        ...options
      }: LoginParams) => {
        const serverType = options.serverType ?? "navidrome";
        const navidrome = options.navidrome ?? null;
        const jellyfin = options.jellyfin ?? null;
        set({
          serverId: serverId.trim(),
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
          subsonicSalt: options.subsonicSalt ?? null,
          subsonicToken: options.subsonicToken ?? null,
          useTokenAuth: options.useTokenAuth ?? true,
        });
      },
      // Repoint the session at a different route for the same server (primary <->
      // fallback failover). Deliberately touches only `url`: the storage scope is
      // keyed on `serverId`, so swapping routes must not disturb any other state.
      setActiveUrl: (url: string) => {
        set({ url: url.trim() });
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
          serverId: "",
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
          useTokenAuth: true,
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
      version: 4,
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<AuthStore> | undefined;
        if (!state || version >= 4) return persistedState as AuthStore;
        return {
          ...state,
          serverType: state.serverType ?? "navidrome",
          jellyfinAccessToken: state.jellyfinAccessToken ?? null,
          jellyfinUserId: state.jellyfinUserId ?? null,
          // Existing sessions authenticated with token+salt, so default to true.
          useTokenAuth: state.useTokenAuth ?? true,
          // v4: `serverId` became the storage scope's identity. It can't be
          // resolved here — that needs the `servers` store, whose rehydration
          // order relative to this one isn't guaranteed — so it's back-filled by
          // services/storageScopeMigration.ts, which runs before first render.
          serverId: state.serverId ?? "",
        } as AuthStore;
      },
    },
  ),
);

// The active session's storage scope. Every scoped store, the query cache, the
// download directory and the local SQLite file resolve their bucket through
// this, so it is the single definition of "whose data is this".
//
// Deliberately independent of `url`: swapping routes (primary <-> fallback) must
// never move the scope, or the app would tear down and re-hydrate as if it were
// a different server. See services/network.ts.
export function currentAuthScope(): string {
  const { serverId, username, serverType } = useAuthBase.getState();
  if (serverType === "local") return LOCAL_AUTH_SCOPE;
  return getAuthScope(serverId, username);
}

// Reactive counterpart of `currentAuthScope`, for components that must re-render
// when the active scope changes. Returns undefined when no session is scoped
// yet, so callers can distinguish "signed out" from a real scope.
export function useCurrentAuthScope(): string | undefined {
  const serverId = useAuthBase((s) => s.serverId);
  const username = useAuthBase((s) => s.username);
  const serverType = useAuthBase((s) => s.serverType);
  if (serverType === "local") return LOCAL_AUTH_SCOPE;
  if (!serverId || !username) return undefined;
  return getAuthScope(serverId, username);
}

const useAuth = createSelectors(useAuthBase);

export default useAuth;
