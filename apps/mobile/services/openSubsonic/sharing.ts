import { subsonicRequest } from "@/services/openSubsonic/index";
import type { Shares } from "@/services/openSubsonic/types";

export const createShare = async (
  id: string,
  { description, expires }: { description?: string; expires?: number },
) =>
  subsonicRequest<{ shares: Shares }>("/rest/createShare", {
    id,
    description,
    expires,
  });

export const deleteShare = async (id: string) =>
  subsonicRequest<Record<string, never>>("/rest/deleteShare", { id });

export const getShares = async () =>
  subsonicRequest<{ shares: Shares }>("/rest/getShares");

export const updateShare = async (
  id: string,
  { description, expires }: { description?: string; expires?: number },
) =>
  subsonicRequest<Record<string, never>>("/rest/updateShare", {
    id,
    description,
    expires,
  });
