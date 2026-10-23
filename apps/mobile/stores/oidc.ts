import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "@/config/storage";

// Tokens for servers signed into through single sign-on (OpenID Connect behind
// an authenticating reverse proxy, issue #252). Kept in their own global store
// rather than in `auth`: a session survives a server switch here, so switching
// back to an SSO server re-authenticates with its refresh token the way a saved
// password does for everyone else — and `auth` is wiped on every logout.
//
// Deliberately not in services/backupStoreKeys.ts' GLOBAL_KEYS: a backup goes
// out through the share sheet, and a refresh token is a standing credential.
// A restored SSO server simply asks for a fresh sign-in.
export type OidcSession = {
  issuer: string;
  clientId: string;
  // Endpoints are kept with the tokens so a refresh never needs discovery: a
  // headless Android Auto boot, or a background refresh on a train, can't
  // afford a round of well-known lookups first.
  tokenEndpoint: string;
  revocationEndpoint?: string;
  endSessionEndpoint?: string;
  // RFC 8707 resource indicator sent with the original request, repeated on
  // refresh so an audience-restricted token keeps its audience.
  resource?: string;
  scopes: string[];
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  // Epoch ms. Absent when the authorization server didn't say (`expires_in`
  // omitted), which RFC 6749 leaves to mean "ask again when it's rejected".
  expiresAt?: number;
};

// Unit separator: never valid in a server id or a username, so two keys can't
// collide however the parts are spelled.
export function oidcSessionKey(serverId: string, username: string): string {
  return `${serverId}\u001f${username}`;
}

type OidcStore = {
  sessions: Record<string, OidcSession>;
  // The session the authorization server just refused to refresh, so the
  // sign-in screen can say why it's showing instead of looking like a crash.
  // In memory only: after a restart there's nothing left to explain.
  expiredNotice: string | null;
  setExpiredNotice: (key: string | null) => void;
  setSession: (key: string, session: OidcSession) => void;
  updateSession: (key: string, patch: Partial<OidcSession>) => void;
  removeSession: (key: string) => void;
  removeServerSessions: (serverId: string) => void;
};

export const useOidcBase = create<OidcStore>()(
  persist(
    (set) => ({
      sessions: {},
      expiredNotice: null,
      setExpiredNotice: (key) => {
        set({ expiredNotice: key });
      },
      setSession: (key, session) => {
        set((state) => ({ sessions: { ...state.sessions, [key]: session } }));
      },
      updateSession: (key, patch) => {
        set((state) => {
          const current = state.sessions[key];
          if (!current) return state;
          return {
            sessions: { ...state.sessions, [key]: { ...current, ...patch } },
          };
        });
      },
      removeSession: (key) => {
        set((state) => {
          if (!state.sessions[key]) return state;
          const { [key]: _removed, ...rest } = state.sessions;
          return { sessions: rest };
        });
      },
      removeServerSessions: (serverId) => {
        const prefix = oidcSessionKey(serverId, "");
        set((state) => ({
          sessions: Object.fromEntries(
            Object.entries(state.sessions).filter(
              ([key]) => !key.startsWith(prefix),
            ),
          ),
        }));
      },
    }),
    {
      name: "oidc",
      storage: createJSONStorage(() => zustandStorage),
      version: 1,
      partialize: (state) => ({ sessions: state.sessions }),
    },
  ),
);

export function getOidcSession(
  serverId: string,
  username: string,
): OidcSession | undefined {
  return useOidcBase.getState().sessions[oidcSessionKey(serverId, username)];
}
