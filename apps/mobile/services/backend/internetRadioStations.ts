import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/internetRadioStations";
import * as L from "@/services/local/internetRadioStations";
import * as S from "@/services/openSubsonic/internetRadioStations";

export const createInternetRadioStation = dispatch(
  S.createInternetRadioStation,
  J.createInternetRadioStation,
  L.createInternetRadioStation,
);
export const getInternetRadioStations = dispatch(
  S.getInternetRadioStations,
  J.getInternetRadioStations,
  L.getInternetRadioStations,
);
export const deleteInternetRadioStation = dispatch(
  S.deleteInternetRadioStation,
  J.deleteInternetRadioStation,
  L.deleteInternetRadioStation,
);
export const updateInternetRadioStation = dispatch(
  S.updateInternetRadioStation,
  J.updateInternetRadioStation,
  L.updateInternetRadioStation,
);
