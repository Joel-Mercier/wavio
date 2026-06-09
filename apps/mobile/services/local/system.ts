import { localEnvelope } from "@/services/local/unsupported";
import type {
  License,
  OpenSubsonicExtensions,
} from "@/services/openSubsonic/types";

// Local backend always "reachable": there is no network round-trip.

export const ping = async (_opts?: { signal?: AbortSignal }) => {
  return localEnvelope({});
};

export const getLicense = async () => {
  const license: License = { valid: true };
  return localEnvelope({ license });
};

export const getOpenSubsonicExtensions = async () => {
  const openSubsonicExtensions: OpenSubsonicExtensions[] = [];
  return localEnvelope({ openSubsonicExtensions });
};
