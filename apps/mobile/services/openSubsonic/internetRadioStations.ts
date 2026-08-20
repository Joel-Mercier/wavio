import { subsonicRequest } from "@/services/openSubsonic/index";
import type { InternetRadioStation } from "@/services/openSubsonic/types";

// Answers an empty envelope, like the sibling mutations below — the created
// station is never echoed back, so callers have to re-read the list. Declaring
// a `radioStation` payload here compiled but described a response the server
// never sends (the generic is a cast, not a runtime check).
export const createInternetRadioStation = async (
  streamUrl: string,
  name: string,
  homePageUrl?: string,
) =>
  subsonicRequest<Record<string, never>>("/rest/createInternetRadioStation", {
    streamUrl,
    name,
    homepageUrl: homePageUrl,
  });

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
