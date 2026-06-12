import { subsonicRequest } from "@/services/openSubsonic/index";
import type { InternetRadioStation } from "@/services/openSubsonic/types";

export const createInternetRadioStation = async (
  streamUrl: string,
  name: string,
  homePageUrl?: string,
) =>
  subsonicRequest<{ radioStation: InternetRadioStation }>(
    "/rest/createInternetRadioStation",
    { streamUrl, name, homepageUrl: homePageUrl },
  );

export const getInternetRadioStations = async () =>
  subsonicRequest<{
    internetRadioStations: { internetRadioStation: InternetRadioStation[] };
  }>("/rest/getInternetRadioStations");

export const deleteInternetRadioStation = async (id: string) =>
  subsonicRequest<Record<string, never>>("/rest/deleteInternetRadioStation", {
    id,
  });

export const updateInternetRadioStation = async (
  id: string,
  {
    streamUrl,
    name,
    homePageUrl,
  }: { streamUrl: string; name: string; homePageUrl?: string },
) =>
  subsonicRequest<Record<string, never>>("/rest/updateInternetRadioStation", {
    id,
    streamUrl,
    name,
    homePageUrl,
  });
