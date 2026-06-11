import { newLocalRadioStationId } from "@/services/local/keys";
import { mapRadioRow } from "@/services/local/mappers";
import {
  deleteRadioStation as deleteRadioStationRow,
  insertRadioStation,
  queryRadioStations,
  updateRadioStation,
} from "@/services/local/repository";
import { localEnvelope } from "@/services/local/unsupported";
import type { InternetRadioStation } from "@/services/openSubsonic/types";

// On-device internet radio stations, backed by the per-(server,user) SQLite
// database (see db.ts). Mirrors services/openSubsonic/internetRadioStations.ts so
// the dispatch layer and hooks consume identical shapes — the same create/edit/
// delete UI works against a local library with no server to host the stations.

export const getInternetRadioStations = async () => {
  const rows = await queryRadioStations();
  return localEnvelope({
    internetRadioStations: { internetRadioStation: rows.map(mapRadioRow) },
  });
};

export const createInternetRadioStation = async (
  streamUrl: string,
  name: string,
  homePageUrl?: string,
) => {
  const id = newLocalRadioStationId();
  await insertRadioStation({
    id,
    name,
    stream_url: streamUrl,
    home_page_url: homePageUrl ?? null,
    created_at: Date.now(),
  });
  const radioStation: InternetRadioStation = {
    id,
    name,
    streamUrl,
    homePageUrl: homePageUrl ?? undefined,
  };
  return localEnvelope({ radioStation });
};

export const updateInternetRadioStation = async (
  id: string,
  {
    streamUrl,
    name,
    homePageUrl,
  }: { streamUrl: string; name: string; homePageUrl?: string },
) => {
  await updateRadioStation(id, {
    name,
    stream_url: streamUrl,
    home_page_url: homePageUrl ?? null,
  });
  return localEnvelope({});
};

export const deleteInternetRadioStation = async (id: string) => {
  await deleteRadioStationRow(id);
  return localEnvelope({});
};
