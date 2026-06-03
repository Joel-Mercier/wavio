import jellyfinApiInstance from "@/services/jellyfin/index";
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

export const getOpenSubsonicExtensions = async () => {
  const openSubsonicExtensions: OpenSubsonicExtensions[] = [];
  return fakeEnvelope({ openSubsonicExtensions });
};
