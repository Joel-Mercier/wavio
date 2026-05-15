import { fakeEnvelope } from "@/services/jellyfin/unsupported";

// Jellyfin has no internet radio stations as music-library items. UI gates
// hide these flows when the active server is Jellyfin.

export const createInternetRadioStation = async (
  _streamUrl: string,
  _name: string,
  _homePageUrl?: string,
) => fakeEnvelope({ radioStation: undefined });

export const getInternetRadioStations = async () =>
  fakeEnvelope({
    internetRadioStations: { internetRadioStation: [] },
  });

export const deleteInternetRadioStation = async (_id: string) =>
  fakeEnvelope({});

export const updateInternetRadioStation = async (
  _id: string,
  _opts: { streamUrl: string; name: string; homePageUrl?: string },
) => fakeEnvelope({});
