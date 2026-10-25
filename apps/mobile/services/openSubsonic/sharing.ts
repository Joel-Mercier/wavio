import { subsonicRequest } from "@/services/openSubsonic/index";
import type { Shares } from "@/services/openSubsonic/types";

export const createShare = async (
  id: string,
  {
    description,
    expires,
    downloadable,
  }: { description?: string; expires?: number; downloadable?: boolean },
) =>
  subsonicRequest<{ shares: Shares }>("/rest/createShare", {
    id,
    description,
    expires,
    downloadable,
  });

export const deleteShare = async (id: string) =>
  subsonicRequest<Record<string, never>>("/rest/deleteShare", { id });

export const getShares = async () =>
  subsonicRequest<{ shares: Shares }>("/rest/getShares");

export const updateShare = async (
  id: string,
  {
    description,
    expires,
    downloadable,
  }: { description?: string; expires?: number; downloadable?: boolean },
) =>
  subsonicRequest<Record<string, never>>("/rest/updateShare", {
    id,
    description,
    expires,
    downloadable,
  });
