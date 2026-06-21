import axios from "axios";
import jellyfinApiInstance, {
  buildAuthorizationHeader,
} from "@/services/jellyfin/index";
import { fakeEnvelope } from "@/services/jellyfin/unsupported";
import type {
  License,
  OpenSubsonicExtensions,
} from "@/services/openSubsonic/types";
import { useAuthBase } from "@/stores/auth";

export const ping = async (opts?: { signal?: AbortSignal }) => {
  const rsp = await jellyfinApiInstance.get<{ Version?: string }>(
    "/System/Info",
    { signal: opts?.signal },
  );
  if (rsp.data?.Version) {
    const current = useAuthBase.getState().serverVersion;
    if (current !== rsp.data.Version) {
      useAuthBase.getState().setServerVersion(rsp.data.Version);
    }
  }
  return fakeEnvelope({});
};

export const getLicense = async () => {
  const license: License = { valid: true };
  return fakeEnvelope({ license });
};

// Probe for the AudioMuse-AI Jellyfin plugin (+ its reachable side-car backend).
// Uses a bare axios call rather than `jellyfinApiInstance` so the expected 404
// on servers without the plugin doesn't reach the instance's error interceptor
// (and Sentry) — every Jellyfin session would otherwise report one on connect.
async function hasAudioMuseAi(): Promise<boolean> {
  const { url, jellyfinAccessToken } = useAuthBase.getState();
  if (!url || !jellyfinAccessToken) return false;
  try {
    await axios.get(`${url.replace(/\/+$/, "")}/AudioMuseAI/info`, {
      headers: {
        "X-Emby-Authorization": buildAuthorizationHeader(jellyfinAccessToken),
        "X-Emby-Token": jellyfinAccessToken,
      },
      timeout: 8000,
    });
    return true;
  } catch {
    return false;
  }
}

export const getOpenSubsonicExtensions = async () => {
  const openSubsonicExtensions: OpenSubsonicExtensions[] = [];
  // Jellyfin doesn't speak OpenSubsonic, so it never advertises extensions of
  // its own. But when the AudioMuse-AI plugin is installed and reachable it
  // exposes audio-similarity endpoints equivalent to the OpenSubsonic
  // `sonicSimilarity` extension. Synthesize that extension entry so the shared
  // similar-songs path (services/similarSongs.ts, hooks/backend/useBrowsing
  // useSimilarTracks) routes through getSonicSimilarTracks for Jellyfin exactly
  // as it does for Subsonic.
  if (await hasAudioMuseAi()) {
    openSubsonicExtensions.push({ name: "sonicSimilarity", versions: [1] });
  }
  return fakeEnvelope({ openSubsonicExtensions });
};
