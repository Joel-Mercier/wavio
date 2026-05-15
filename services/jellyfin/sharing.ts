import { fakeEnvelope } from "@/services/jellyfin/unsupported";
import type { Shares } from "@/services/openSubsonic/types";

// Jellyfin has no public-share concept. UI gates these flows off via the
// `sharing` capability flag; these stubs keep the dispatcher type-safe.

export const createShare = async (
  _id: string,
  _opts: { description?: string; expires?: number },
) => {
  const shares: Shares = { share: [] };
  return fakeEnvelope({ shares });
};

export const deleteShare = async (_id: string) => fakeEnvelope({});

export const getShares = async () => {
  const shares: Shares = { share: [] };
  return fakeEnvelope({ shares });
};

export const updateShare = async (
  _id: string,
  _opts: { description?: string; expires?: number },
) => fakeEnvelope({});
