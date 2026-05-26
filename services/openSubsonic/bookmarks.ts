import axios from "axios";
import type { Bookmarks, PlayQueue } from "@/services/openSubsonic/types";
import openSubsonicApiInstance, { type OpenSubsonicResponse } from ".";

// Subsonic expresses bookmark / play-queue positions in milliseconds, but the
// rest of the app works in seconds (matching the audio engine and the Jellyfin
// adapter). Convert at this boundary so callers stay protocol-agnostic.
const toMs = (seconds: number) => Math.max(0, Math.round(seconds * 1000));
const toSeconds = (ms: number | undefined) =>
  ms == null ? 0 : Math.max(0, ms / 1000);

export const createBookmark = async (
  id: string,
  position: number,
  { comment }: { comment?: string },
) => {
  try {
    const rsp = await openSubsonicApiInstance.post<
      OpenSubsonicResponse<Record<string, never>>
    >(
      "/rest/createBookmark",
      {},
      { params: { id, position: toMs(position), comment } },
    );
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const deleteBookmark = async (id: string) => {
  try {
    const rsp = await openSubsonicApiInstance.delete<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/deleteBookmark", {
      params: {
        id,
      },
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const getBookmarks = async () => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ bookmarks: Bookmarks }>
    >("/rest/getBookmarks", {
      params: {},
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    const envelope = rsp.data["subsonic-response"];
    for (const bookmark of envelope.bookmarks?.bookmark ?? []) {
      bookmark.position = toSeconds(bookmark.position);
    }
    return envelope;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const getPlayQueue = async () => {
  try {
    const rsp = await openSubsonicApiInstance.get<
      OpenSubsonicResponse<{ playQueue: PlayQueue }>
    >("/rest/getPlayQueue", {
      params: {},
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    const envelope = rsp.data["subsonic-response"];
    if (envelope.playQueue && typeof envelope.playQueue.position === "number") {
      envelope.playQueue.position = toSeconds(envelope.playQueue.position);
    }
    return envelope;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const savePlayQueue = async ({
  ids,
  current,
  position,
}: {
  ids?: string[];
  current?: string;
  position?: number;
}) => {
  try {
    // Subsonic takes a repeated `id` param for each queue entry plus the
    // currently playing id and offset. Form-encode the body (repeated keys are
    // not expressible as a plain object) while auth params ride the query
    // string via the request interceptor.
    const body = new URLSearchParams();
    for (const trackId of ids ?? []) body.append("id", trackId);
    if (current != null) body.append("current", current);
    if (position != null) body.append("position", String(toMs(position)));
    const rsp = await openSubsonicApiInstance.post<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/savePlayQueue", body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (rsp.data["subsonic-response"]?.status !== "ok") {
      throw rsp.data["subsonic-response"].error;
    }
    return rsp.data["subsonic-response"];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};
