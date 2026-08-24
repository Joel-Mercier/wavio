import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// ListenBrainz connection, persisted per (server, user). A ListenBrainz account
// is the *listener's*, not the music server's, but the scope still has to be
// per-server: `serverIsScrobbling` describes one specific server, and two
// sessions on the same device can belong to different people. The user token is
// a credential, another reason to keep it out of a shared bucket.

export const LISTENBRAINZ_DEFAULT_BASE_URL = "https://api.listenbrainz.org";

// A play waiting to reach ListenBrainz. `listenedAt` is Unix *seconds* (what
// submit-listens wants) and is captured when playback started, so a listen that
// only leaves the device days later still lands at the right point in history.
export type QueuedListen = {
  id: string;
  listenedAt: number;
  retryCount: number;
  track: {
    trackName: string;
    artistName: string;
    releaseName?: string;
    recordingMbid?: string;
    releaseMbid?: string;
    artistMbids?: string[];
    durationMs?: number;
    trackNumber?: string;
  };
};

// Whether the active server is already sending this user's plays to
// ListenBrainz, which would make app-side scrobbling count every play twice.
// `null` is "we couldn't tell" and is distinct from `false`: only Navidrome and
// (admin-only) Jellyfin can answer, so on OpenSubsonic, on a local library and
// for a non-admin Jellyfin user this stays null and the UI shows no warning.
export type ServerScrobbleState = boolean | null;

interface ListenBrainzStore {
  token: string;
  userName: string | null;
  baseUrl: string;
  scrobblingEnabled: boolean;
  submitNowPlaying: boolean;
  lastValidatedAt: number | null;
  serverIsScrobbling: ServerScrobbleState;
  queue: QueuedListen[];
  setConfig: (config: { token: string; userName: string }) => void;
  setBaseUrl: (baseUrl: string) => void;
  setScrobblingEnabled: (enabled: boolean) => void;
  setSubmitNowPlaying: (enabled: boolean) => void;
  setServerIsScrobbling: (state: ServerScrobbleState) => void;
  enqueueListen: (listen: Omit<QueuedListen, "id" | "retryCount">) => void;
  removeListens: (ids: string[]) => void;
  bumpRetry: (ids: string[]) => void;
  clearQueue: () => void;
  clearConfig: () => void;
  __reset: () => void;
}

// The queue is unbounded in normal use — it drains on the next connection — but
// a device that never reconnects (or a token that stays invalid) must not grow
// it forever. Oldest listens are dropped first: recent history is the part a
// user notices missing.
const MAX_QUEUED_LISTENS = 2000;

const initialState = {
  token: "",
  userName: null,
  baseUrl: LISTENBRAINZ_DEFAULT_BASE_URL,
  // Off until the user connects a token; `connect` turns it on, unless the
  // server is already scrobbling for them (see components/listenBrainz).
  scrobblingEnabled: false,
  submitNowPlaying: true,
  lastValidatedAt: null,
  serverIsScrobbling: null as ServerScrobbleState,
  queue: [] as QueuedListen[],
};

const useListenBrainzBase = create<ListenBrainzStore>()(
  persist(
    (set) => ({
      ...initialState,

      __reset: () => {
        set(() => ({ ...initialState }));
      },

      setConfig: ({ token, userName }) => {
        set({ token, userName, lastValidatedAt: Date.now() });
      },
      setBaseUrl: (baseUrl) => {
        set({ baseUrl: baseUrl.trim() || LISTENBRAINZ_DEFAULT_BASE_URL });
      },
      setScrobblingEnabled: (scrobblingEnabled) => {
        set({ scrobblingEnabled });
      },
      setSubmitNowPlaying: (submitNowPlaying) => {
        set({ submitNowPlaying });
      },
      setServerIsScrobbling: (serverIsScrobbling) => {
        set({ serverIsScrobbling });
      },
      enqueueListen: (listen) => {
        set((state) => {
          const next = [
            ...state.queue,
            {
              ...listen,
              id: `${listen.listenedAt}-${Math.random().toString(36).slice(2, 10)}`,
              retryCount: 0,
            },
          ];
          return {
            queue:
              next.length > MAX_QUEUED_LISTENS
                ? next.slice(next.length - MAX_QUEUED_LISTENS)
                : next,
          };
        });
      },
      removeListens: (ids) => {
        const removing = new Set(ids);
        set((state) => ({
          queue: state.queue.filter((item) => !removing.has(item.id)),
        }));
      },
      bumpRetry: (ids) => {
        const bumping = new Set(ids);
        set((state) => ({
          queue: state.queue.map((item) =>
            bumping.has(item.id)
              ? { ...item, retryCount: item.retryCount + 1 }
              : item,
          ),
        }));
      },
      clearQueue: () => {
        set({ queue: [] });
      },
      clearConfig: () => {
        // Keeps the queue: those plays were already earned, and removing a token
        // is usually a prelude to pasting a fresh one. Nothing can leave the
        // device while disconnected (drainListenQueue checks), and clearQueue is
        // there for a deliberate discard.
        set((state) => ({ ...initialState, queue: state.queue }));
      },
    }),
    {
      name: "listenBrainzStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
      partialize: (state) => ({
        token: state.token,
        userName: state.userName,
        baseUrl: state.baseUrl,
        scrobblingEnabled: state.scrobblingEnabled,
        submitNowPlaying: state.submitNowPlaying,
        lastValidatedAt: state.lastValidatedAt,
        serverIsScrobbling: state.serverIsScrobbling,
        queue: state.queue,
      }),
    },
  ),
);

const useListenBrainz = createSelectors(useListenBrainzBase);

// True when a token has been validated, i.e. every ListenBrainz surface can run.
export const isListenBrainzConnected = (): boolean => {
  const { token, userName } = useListenBrainzBase.getState();
  return token.length > 0 && userName !== null;
};

// The gate every submission path checks: connected *and* the user wants us to
// scrobble. Deliberately independent of `serverIsScrobbling` — that only steers
// the default and the warning; a user who turns this on anyway gets what they
// asked for.
export const isListenBrainzScrobblingEnabled = (): boolean =>
  isListenBrainzConnected() && useListenBrainzBase.getState().scrobblingEnabled;

export { useListenBrainzBase };
export default useListenBrainz;
