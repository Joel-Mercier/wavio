import { JellyfinUnsupportedError } from "@/services/jellyfin/unsupported";

// Jellyfin has no equivalent of Subsonic's jukeboxControl. UI gates these
// behind the `jukebox` capability flag; the stubs exist to keep the dispatcher
// type-safe.

const unsupported = () => {
  throw new JellyfinUnsupportedError("jukebox");
};

export const getJukebox = async () => unsupported();
export const statusJukebox = async () => unsupported();
export const setJukebox = async (_ids: string[]) => unsupported();
export const startJukebox = async () => unsupported();
export const stopJukebox = async () => unsupported();
export const skipJukebox = async (_index: number, _offset?: number) =>
  unsupported();
export const addJukebox = async (_ids: string[]) => unsupported();
export const clearJukebox = async () => unsupported();
export const removeJukebox = async (_index: number) => unsupported();
export const shuffleJukebox = async () => unsupported();
export const setGainJukebox = async (_gain: number) => unsupported();
