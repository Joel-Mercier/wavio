import axios from "axios";
import openSubsonicApiInstance, {
  type OpenSubsonicResponse,
} from "@/services/openSubsonic/index";
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

type JukeboxStatusEnvelope = OpenSubsonicResponse<{
  jukeboxStatus: JukeboxStatus;
}>;
type JukeboxPlaylistEnvelope = OpenSubsonicResponse<{
  jukeboxPlaylist: JukeboxPlaylist;
}>;

async function call<T>(action: string, params: Record<string, unknown> = {}) {
  try {
    const rsp = await openSubsonicApiInstance.get<T>("/rest/jukeboxControl", {
      params: { action, ...params },
      paramsSerializer: repeatParamsSerializer,
    });
    const envelope = (
      rsp.data as { "subsonic-response"?: { status?: string } }
    )["subsonic-response"];
    if (envelope?.status !== "ok") {
      throw (envelope as { error?: unknown })?.error;
    }
    return (rsp.data as { "subsonic-response": unknown })["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
}

export const getJukebox = async () =>
  call<JukeboxPlaylistEnvelope>("get") as Promise<
    JukeboxPlaylistEnvelope["subsonic-response"]
  >;

export const statusJukebox = async () =>
  call<JukeboxStatusEnvelope>("status") as Promise<
    JukeboxStatusEnvelope["subsonic-response"]
  >;

export const setJukebox = async (ids: string[]) =>
  call<JukeboxStatusEnvelope>("set", { id: ids }) as Promise<
    JukeboxStatusEnvelope["subsonic-response"]
  >;

export const startJukebox = async () =>
  call<JukeboxStatusEnvelope>("start") as Promise<
    JukeboxStatusEnvelope["subsonic-response"]
  >;

export const stopJukebox = async () =>
  call<JukeboxStatusEnvelope>("stop") as Promise<
    JukeboxStatusEnvelope["subsonic-response"]
  >;

export const skipJukebox = async (index: number, offset?: number) =>
  call<JukeboxStatusEnvelope>("skip", { index, offset }) as Promise<
    JukeboxStatusEnvelope["subsonic-response"]
  >;

export const addJukebox = async (ids: string[]) =>
  call<JukeboxStatusEnvelope>("add", { id: ids }) as Promise<
    JukeboxStatusEnvelope["subsonic-response"]
  >;

export const clearJukebox = async () =>
  call<JukeboxStatusEnvelope>("clear") as Promise<
    JukeboxStatusEnvelope["subsonic-response"]
  >;

export const removeJukebox = async (index: number) =>
  call<JukeboxStatusEnvelope>("remove", { index }) as Promise<
    JukeboxStatusEnvelope["subsonic-response"]
  >;

export const shuffleJukebox = async () =>
  call<JukeboxStatusEnvelope>("shuffle") as Promise<
    JukeboxStatusEnvelope["subsonic-response"]
  >;

export const setGainJukebox = async (gain: number) =>
  call<JukeboxStatusEnvelope>("setGain", { gain }) as Promise<
    JukeboxStatusEnvelope["subsonic-response"]
  >;
