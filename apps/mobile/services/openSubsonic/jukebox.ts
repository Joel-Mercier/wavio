import { subsonicRequest } from "@/services/openSubsonic/index";
import type {
  JukeboxPlaylist,
  JukeboxStatus,
} from "@/services/openSubsonic/types";

// Subsonic expects repeated `id=a&id=b` for multi-valued ids; axios's default
// serializer would emit `id[]=a&id[]=b`. The repeat serializer keeps the bare
// `id=` form for every value.
const repeatParamsSerializer = (params: Record<string, unknown>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v != null) search.append(key, String(v));
      }
    } else {
      search.append(key, String(value));
    }
  }
  return search.toString();
};

type JukeboxStatusPayload = { jukeboxStatus: JukeboxStatus };
type JukeboxPlaylistPayload = { jukeboxPlaylist: JukeboxPlaylist };

async function call<T>(action: string, params: Record<string, unknown> = {}) {
  return subsonicRequest<T>(
    "/rest/jukeboxControl",
    { action, ...params },
    { paramsSerializer: repeatParamsSerializer },
  );
}

export const getJukebox = async () => call<JukeboxPlaylistPayload>("get");

export const statusJukebox = async () => call<JukeboxStatusPayload>("status");

export const setJukebox = async (ids: string[]) =>
  call<JukeboxStatusPayload>("set", { id: ids });

export const startJukebox = async () => call<JukeboxStatusPayload>("start");

export const stopJukebox = async () => call<JukeboxStatusPayload>("stop");

export const skipJukebox = async (index: number, offset?: number) =>
  call<JukeboxStatusPayload>("skip", { index, offset });

export const addJukebox = async (ids: string[]) =>
  call<JukeboxStatusPayload>("add", { id: ids });

export const clearJukebox = async () => call<JukeboxStatusPayload>("clear");

export const removeJukebox = async (index: number) =>
  call<JukeboxStatusPayload>("remove", { index });

export const shuffleJukebox = async () => call<JukeboxStatusPayload>("shuffle");

export const setGainJukebox = async (gain: number) =>
  call<JukeboxStatusPayload>("setGain", { gain });
