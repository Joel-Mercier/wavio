import axios from "axios";
import radioBrowserApiInstance from "@/services/radioBrowser/index";
import type {
  RadioBrowserCountry,
  RadioBrowserLanguage,
  RadioBrowserStation,
  RadioBrowserTag,
} from "@/services/radioBrowser/types";

interface Paging {
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 25;

export interface SearchStationsParams extends Paging {
  name?: string;
  tag?: string;
  // Comma-separated list of tags the station must ALL have.
  tagList?: string;
  country?: string;
  countrycode?: string;
  language?: string;
  order?: "name" | "votes" | "clickcount" | "bitrate" | "country" | "random";
  reverse?: boolean;
}

const get = async <T>(
  url: string,
  params: Record<string, unknown>,
): Promise<T[]> => {
  try {
    const rsp = await radioBrowserApiInstance.get<T[]>(url, {
      params: { hidebroken: true, ...params },
    });
    return rsp.data ?? [];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const searchStations = ({
  name,
  tag,
  tagList,
  country,
  countrycode,
  language,
  order,
  reverse,
  limit = DEFAULT_LIMIT,
  offset = 0,
}: SearchStationsParams) =>
  get<RadioBrowserStation>("/json/stations/search", {
    name,
    tag,
    tagList,
    country,
    countrycode,
    language,
    order,
    reverse,
    limit,
    offset,
  });

export const getTopVotedStations = ({
  limit = DEFAULT_LIMIT,
  offset = 0,
}: Paging = {}) =>
  get<RadioBrowserStation>("/json/stations/search", {
    order: "votes",
    reverse: true,
    limit,
    offset,
  });

export const getPopularStations = ({
  limit = DEFAULT_LIMIT,
  offset = 0,
}: Paging = {}) =>
  get<RadioBrowserStation>("/json/stations/search", {
    order: "clickcount",
    reverse: true,
    limit,
    offset,
  });

export const getStationsByCountryCode = (
  countrycode: string,
  { limit = DEFAULT_LIMIT, offset = 0 }: Paging = {},
) =>
  get<RadioBrowserStation>(
    `/json/stations/bycountrycodeexact/${encodeURIComponent(countrycode)}`,
    {
      order: "votes",
      reverse: true,
      limit,
      offset,
    },
  );

export const getStationsByTag = (
  tag: string,
  { limit = DEFAULT_LIMIT, offset = 0 }: Paging = {},
) =>
  get<RadioBrowserStation>(
    `/json/stations/bytagexact/${encodeURIComponent(tag)}`,
    {
      order: "votes",
      reverse: true,
      limit,
      offset,
    },
  );

// Lookup lists used to power the search filters. Tags can number in the
// thousands, so default to the most-used ones ordered by station count.
export const getTags = ({ limit = 200 }: { limit?: number } = {}) =>
  get<RadioBrowserTag>("/json/tags", {
    order: "stationcount",
    reverse: true,
    limit,
  });

export const getCountries = () =>
  get<RadioBrowserCountry>("/json/countries", { order: "name" });

export const getLanguages = () =>
  get<RadioBrowserLanguage>("/json/languages", { order: "name" });

// Registers a "click" (play) for a station. Fire-and-forget — it bumps the
// station's click count and returns the resolved stream URL.
export const registerStationClick = async (stationuuid: string) => {
  try {
    await radioBrowserApiInstance.get(
      `/json/url/${encodeURIComponent(stationuuid)}`,
    );
  } catch {
    // Non-critical analytics call; ignore failures.
  }
};
