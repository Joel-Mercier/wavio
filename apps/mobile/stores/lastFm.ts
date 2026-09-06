import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// Last.fm connection, persisted per (server, user). A Last.fm account is the
// *listener's*, not the music server's, but the scope still has to be
// per-server: `serverIsScrobbling` describes one specific server, and two
// sessions on the same device can belong to different people. The session key
// is a credential, another reason to keep it out of a shared bucket.

// A play waiting to reach Last.fm. `timestamp` is Unix *seconds* and is captured
// when playback started, which is what track.scrobble asks for.
export type QueuedScrobble = {
  id: string;
  timestamp: number;
  retryCount: number;
  track: {
    artist: string;
    track: string;
    album?: string;
    albumArtist?: string;
    duration?: number;
    trackNumber?: string;
    mbid?: string;
    // 0 when the track was picked for the user (endless radio / autoplay), 1
    // when they chose it. Last.fm weights recommendations with this.
    chosenByUser: 0 | 1;
  };
};

// A love/unlove waiting to reach Last.fm. track.love has no batch form, so these
// drain one request at a time rather than fifty.
export type QueuedLove = {
  id: string;
  retryCount: number;
  loved: boolean;
  artist: string;
  track: string;
};

// Whether the active server is already sending this user's plays to Last.fm,
// which would make app-side scrobbling count every play twice. `null` is "we
// couldn't tell" and is distinct from `false`: only Navidrome and (admin-only)
// Jellyfin can answer, so on OpenSubsonic, on a local library and for a
// non-admin Jellyfin user this stays null and the UI shows no warning.
export type ServerScrobbleState = boolean | null;

interface LastFmStore {
  sessionKey: string;
  userName: string | null;
  scrobblingEnabled: boolean;
  submitNowPlaying: boolean;
  syncLoves: boolean;
  sessionInvalid: boolean;
  lastValidatedAt: number | null;
  serverIsScrobbling: ServerScrobbleState;
  queue: QueuedScrobble[];
  loveQueue: QueuedLove[];
  setSession: (session: { sessionKey: string; userName: string }) => void;
  setScrobblingEnabled: (enabled: boolean) => void;
  setSubmitNowPlaying: (enabled: boolean) => void;
  setSyncLoves: (enabled: boolean) => void;
  setSessionInvalid: (invalid: boolean) => void;
  setServerIsScrobbling: (state: ServerScrobbleState) => void;
  enqueueScrobble: (
    scrobble: Omit<QueuedScrobble, "id" | "retryCount">,
  ) => void;
  removeScrobbles: (ids: string[]) => void;
  bumpScrobbleRetry: (ids: string[]) => void;
  enqueueLove: (love: Omit<QueuedLove, "id" | "retryCount">) => void;
  removeLoves: (ids: string[]) => void;
  bumpLoveRetry: (ids: string[]) => void;
  clearQueue: () => void;
  clearConfig: () => void;
  __reset: () => void;
}

// The queue is unbounded in normal use — it drains on the next connection — but
// a device that never reconnects (or a session key that stays revoked) must not
// grow it forever. Oldest plays are dropped first: recent history is the part a
// user notices missing.
const MAX_QUEUED_SCROBBLES = 2000;
const MAX_QUEUED_LOVES = 500;

const initialState = {
  sessionKey: "",
  userName: null as string | null,
  // Off until the user connects an account; the settings screen turns it on,
  // unless the server is already scrobbling for them.
  scrobblingEnabled: false,
  submitNowPlaying: true,
  // Off by default: unlike a scrobble, this *writes* to the user's Last.fm
  // account every time they tap a heart, so it has to be asked for.
  syncLoves: false,
  sessionInvalid: false,
  lastValidatedAt: null as number | null,
  serverIsScrobbling: null as ServerScrobbleState,
  queue: [] as QueuedScrobble[],
  loveQueue: [] as QueuedLove[],
};

const newId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const capped = <T>(items: T[], max: number): T[] =>
  items.length > max ? items.slice(items.length - max) : items;

const useLastFmBase = create<LastFmStore>()(
  persist(
    (set) => ({
      ...initialState,

      __reset: () => {
        set(() => ({ ...initialState }));
      },

      setSession: ({ sessionKey, userName }) => {
        set({
          sessionKey,
          userName,
          sessionInvalid: false,
          lastValidatedAt: Date.now(),
        });
      },
      setScrobblingEnabled: (scrobblingEnabled) => {
        set({ scrobblingEnabled });
      },
      setSubmitNowPlaying: (submitNowPlaying) => {
        set({ submitNowPlaying });
      },
      setSyncLoves: (syncLoves) => {
        set({ syncLoves });
      },
      setSessionInvalid: (sessionInvalid) => {
        set({ sessionInvalid });
      },
      setServerIsScrobbling: (serverIsScrobbling) => {
        set({ serverIsScrobbling });
      },
      enqueueScrobble: (scrobble) => {
        set((state) => ({
          queue: capped(
            [...state.queue, { ...scrobble, id: newId("s"), retryCount: 0 }],
            MAX_QUEUED_SCROBBLES,
          ),
        }));
      },
      removeScrobbles: (ids) => {
        const removing = new Set(ids);
        set((state) => ({
          queue: state.queue.filter((item) => !removing.has(item.id)),
        }));
      },
      bumpScrobbleRetry: (ids) => {
        const bumping = new Set(ids);
        set((state) => ({
          queue: state.queue.map((item) =>
            bumping.has(item.id)
              ? { ...item, retryCount: item.retryCount + 1 }
              : item,
          ),
        }));
      },
      enqueueLove: (love) => {
        set((state) => ({
          // A love and an unlove of the same track cancel out, and only the last
          // one is true. Collapsing them here keeps a user toggling a heart from
          // queueing a dozen contradictory writes against their account.
          loveQueue: capped(
            [
              ...state.loveQueue.filter(
                (item) =>
                  item.artist !== love.artist || item.track !== love.track,
              ),
              { ...love, id: newId("l"), retryCount: 0 },
            ],
            MAX_QUEUED_LOVES,
          ),
        }));
      },
      removeLoves: (ids) => {
        const removing = new Set(ids);
        set((state) => ({
          loveQueue: state.loveQueue.filter((item) => !removing.has(item.id)),
        }));
      },
      bumpLoveRetry: (ids) => {
        const bumping = new Set(ids);
        set((state) => ({
          loveQueue: state.loveQueue.map((item) =>
            bumping.has(item.id)
              ? { ...item, retryCount: item.retryCount + 1 }
              : item,
          ),
        }));
      },
      clearQueue: () => {
        set({ queue: [], loveQueue: [] });
      },
      clearConfig: () => {
        // Keeps the queues: those plays were already earned, and disconnecting
        // is usually a prelude to signing back in. Nothing can leave the device
        // while disconnected (the drain checks), and clearQueue is there for a
        // deliberate discard.
        set((state) => ({
          ...initialState,
          queue: state.queue,
          loveQueue: state.loveQueue,
        }));
      },
    }),
    {
      name: "lastFmStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
      partialize: (state) => ({
        sessionKey: state.sessionKey,
        userName: state.userName,
        scrobblingEnabled: state.scrobblingEnabled,
        submitNowPlaying: state.submitNowPlaying,
        syncLoves: state.syncLoves,
        sessionInvalid: state.sessionInvalid,
        lastValidatedAt: state.lastValidatedAt,
        serverIsScrobbling: state.serverIsScrobbling,
        queue: state.queue,
        loveQueue: state.loveQueue,
      }),
    },
  ),
);

const useLastFm = createSelectors(useLastFmBase);

// True when a session key has been obtained, i.e. every Last.fm surface can run.
// A revoked key still counts as connected: the account is known and the settings
// screen needs to say "sign in again" rather than "not set up".
export const isLastFmConnected = (): boolean => {
  const { sessionKey, userName } = useLastFmBase.getState();
  return sessionKey.length > 0 && userName !== null;
};

// The gate every submission path checks: connected, not revoked, and the user
// wants us to scrobble. Deliberately independent of `serverIsScrobbling` — that
// only steers the default and the warning; a user who turns this on anyway gets
// what they asked for.
export const isLastFmScrobblingEnabled = (): boolean => {
  const { scrobblingEnabled, sessionInvalid } = useLastFmBase.getState();
  return isLastFmConnected() && scrobblingEnabled && !sessionInvalid;
};

export { useLastFmBase };
export default useLastFm;
