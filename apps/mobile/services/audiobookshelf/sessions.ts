import { Platform } from "react-native";
import {
  type AbsRequestOptions,
  absRequest,
} from "@/services/audiobookshelf/index";
import type {
  AbsDeviceInfo,
  AbsLocalSession,
  AbsPlaybackSession,
} from "@/services/audiobookshelf/types";
import { getDeviceId } from "@/services/jellyfin/deviceId";
import { USER_AGENT } from "@/utils/userAgent";

export const MEDIA_PLAYER = "wavio";

// Formats the device decodes natively on both platforms. Anything else makes
// the server open an HLS transcode, which the per-file queue can't follow.
const SUPPORTED_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/x-m4a",
  "audio/x-m4b",
  "audio/flac",
  "audio/x-flac",
  "audio/ogg",
  "audio/opus",
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
];

export function absDeviceInfo(): AbsDeviceInfo {
  return {
    deviceId: getDeviceId(),
    clientName: "Wavio",
    clientVersion: USER_AGENT.replace(/^Wavio\//, ""),
    manufacturer: Platform.OS === "ios" ? "Apple" : undefined,
    model: Platform.OS,
  };
}

export async function startPlaybackSession(
  itemId: string,
): Promise<AbsPlaybackSession> {
  return absRequest<AbsPlaybackSession>(
    `/api/items/${encodeURIComponent(itemId)}/play`,
    {
      method: "POST",
      data: {
        deviceInfo: absDeviceInfo(),
        forceDirectPlay: true,
        forceTranscode: false,
        supportedMimeTypes: SUPPORTED_MIME_TYPES,
        mediaPlayer: MEDIA_PLAYER,
      },
    },
  );
}

export async function syncPlaybackSession(
  sessionId: string,
  data: { currentTime: number; timeListened: number; duration: number },
): Promise<void> {
  await absRequest(`/api/session/${encodeURIComponent(sessionId)}/sync`, {
    method: "POST",
    data,
    notFoundIsExpected: true,
  });
}

export async function closePlaybackSession(
  sessionId: string,
  data?: { currentTime: number; timeListened: number; duration: number },
  config?: AbsRequestOptions["config"],
): Promise<void> {
  await absRequest(`/api/session/${encodeURIComponent(sessionId)}/close`, {
    method: "POST",
    data,
    config,
    notFoundIsExpected: true,
  });
}

export async function syncLocalSessions(
  sessions: AbsLocalSession[],
): Promise<void> {
  await absRequest("/api/session/local-all", {
    method: "POST",
    data: { sessions, deviceInfo: absDeviceInfo() },
  });
}
