// Shared helpers for Jellyfin endpoints with no native equivalent.
// They return empty success envelopes so UI capability gates can hide the
// affected sections without consumers crashing on missing fields.

import { useAuthBase } from "@/stores/auth";

export class JellyfinUnsupportedError extends Error {
  constructor(feature: string) {
    super(`Jellyfin does not support ${feature}`);
    this.name = "JellyfinUnsupportedError";
  }
}

export function fakeEnvelope<T>(payload: T): T & {
  status: "ok";
  version: string;
  type: string;
  serverVersion: string;
  openSubsonic: boolean;
} {
  return {
    ...payload,
    status: "ok" as const,
    version: "1.16.1",
    type: "jellyfin",
    serverVersion: useAuthBase.getState().serverVersion ?? "",
    openSubsonic: false,
  };
}
