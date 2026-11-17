import { normalizeBase } from "@/modules/ssl-trust";
import { absServerUrl } from "@/services/audiobookshelf";
import {
  authHeadersForUrl,
  requestHeadersForUrl,
  subscribeCustomHeaders,
} from "@/services/serverHeaders";
import {
  isAudiobookshelfConnected,
  useAudiobookshelfBase,
} from "@/stores/audiobookshelf";
import { useAuthBase } from "@/stores/auth";
import { useServersBase } from "@/stores/servers";
import { CarAutoBridge } from "./bridge";

let lastPushed: string | null = null;

function artworkOrigins(): string[] {
  const { url, serverId } = useAuthBase.getState();
  const server = useServersBase
    .getState()
    .servers.find((candidate) => candidate.id === serverId);
  const urls = [url, server?.url, server?.fallbackUrl];
  if (isAudiobookshelfConnected()) urls.push(absServerUrl());
  return [...new Set(urls.filter((value): value is string => !!value))];
}

export function pushArtworkHeaders() {
  const headers: Record<string, Record<string, string>> = {};
  for (const url of artworkOrigins()) {
    headers[normalizeBase(url)] = {
      ...requestHeadersForUrl(url),
      ...authHeadersForUrl(url),
    };
  }
  const key = JSON.stringify(headers);
  if (key === lastPushed) return;
  lastPushed = key;
  CarAutoBridge.setArtworkHeaders(headers);
}

let started = false;

export function startArtworkHeaders() {
  if (started || !CarAutoBridge.available) return;
  started = true;
  pushArtworkHeaders();
  subscribeCustomHeaders(pushArtworkHeaders);
  useAuthBase.subscribe(pushArtworkHeaders);
  useAudiobookshelfBase.subscribe(pushArtworkHeaders);
}
