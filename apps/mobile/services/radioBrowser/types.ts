// Radio-Browser station shape (subset of fields the API returns).
// See https://api.radio-browser.info/#Struct_Station
export interface RadioBrowserStation {
  stationuuid: string;
  name: string;
  // Original stream URL as submitted.
  url: string;
  // Resolved/redirect-followed stream URL — prefer this for playback.
  url_resolved: string;
  homepage: string;
  favicon: string;
  tags: string;
  country: string;
  countrycode: string;
  // Country subdivision (region/state) the station is located in.
  state: string;
  language: string;
  languagecodes: string;
  codec: string;
  bitrate: number;
  votes: number;
  clickcount: number;
  // Hydrated client-side from the favorites store.
  isFavorite?: boolean;
}

export interface RadioBrowserServer {
  ip: string;
  name: string;
}

export interface RadioBrowserTag {
  name: string;
  stationcount: number;
}

export interface RadioBrowserCountry {
  name: string;
  iso_3166_1: string;
  stationcount: number;
}

export interface RadioBrowserLanguage {
  name: string;
  iso_639: string;
  stationcount: number;
}
