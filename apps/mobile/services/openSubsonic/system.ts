import { subsonicRequest } from "@/services/openSubsonic/index";
import type {
  License,
  OpenSubsonicExtensions,
} from "@/services/openSubsonic/types";

export const getLicense = async () =>
  subsonicRequest<{ license: License }>("/rest/getLicense");

export const getOpenSubsonicExtensions = async () =>
  subsonicRequest<{ openSubsonicExtensions: OpenSubsonicExtensions[] }>(
    "/rest/getOpenSubsonicExtensions",
  );

export const ping = async (opts?: { signal?: AbortSignal }) =>
  subsonicRequest<Record<string, never>>(
    "/rest/ping",
    {},
    { signal: opts?.signal },
  );
