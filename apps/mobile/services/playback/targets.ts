// Importing a target's service module is what registers it — each calls
// registerRemoteTarget at module scope. This module exists so that asking "what
// is playing remotely?" also guarantees every target has been loaded.
//
// It matters because Android Auto binds the media service without ever starting
// an Activity (see services/carAuto/session.ts), so the JS runtime can boot with
// no UI at all. Leaving registration to whichever screen happens to import the
// service would strand an active session in that case: nothing would claim
// playback and the local engine would answer transport commands instead.
import "@/services/jukebox";
import "@/services/upnp";

export type { RemoteTarget } from "./remoteTarget";
export {
  activeRemoteTarget,
  registerRemoteTarget,
  subscribeRemoteChange,
} from "./remoteTarget";
