import { getInternetRadioStations } from "@/services/backend/internetRadioStations";
import { currentLibraryCapabilities } from "@/services/libraryContext";
import { currentAuthScope } from "@/stores/auth";
import type { QueueTrack } from "@/stores/queue";
import useRadioStations, {
  radioFavoritesForScope,
} from "@/stores/radioStations";
import useRecentPlays from "@/stores/recentPlays";
import { encodeMediaId } from "../mediaId";
import type { BrowseNode } from "../types";
import type { Listing } from "./shared";

type Station = {
  id: string;
  name: string;
  streamUrl: string;
  homePageUrl?: string;
  imageUrl?: string;
  source?: "server" | "radioBrowser";
};

const known = new Map<string, Station>();

const stationNode = (station: Station): BrowseNode => ({
  id: encodeMediaId({ kind: "radioStation", id: station.id }),
  title: station.name,
  artworkUrl: station.imageUrl,
  playable: true,
});

function favoriteStations(): Station[] {
  return radioFavoritesForScope(
    useRadioStations.getState().favoriteRadioStations,
    currentAuthScope(),
  );
}

async function serverStations(): Promise<Station[]> {
  if (!currentLibraryCapabilities().internetRadio) return [];
  const rsp = await getInternetRadioStations().catch(() => null);
  return (rsp?.internetRadioStations?.internetRadioStation ?? []).map(
    (station) => ({ ...station, source: "server" as const }),
  );
}

export async function radioListing(): Promise<Listing> {
  const favorites = favoriteStations();
  const ids = new Set(favorites.map((station) => station.id));
  const server = (await serverStations()).filter(
    (station) => !ids.has(station.id),
  );
  const stations = [...favorites, ...server];
  for (const station of stations) known.set(station.id, station);
  return { nodes: stations.map(stationNode) };
}

function recentStation(id: string): Station | undefined {
  const play = useRecentPlays
    .getState()
    .recentPlays.find(
      (entry) => entry.type === "internetRadioStation" && entry.id === id,
    );
  if (!play?.streamUrl) return undefined;
  return {
    id: play.id,
    name: play.title,
    streamUrl: play.streamUrl,
    homePageUrl: play.homePageUrl,
    imageUrl: play.coverArt,
    source: play.source,
  };
}

export async function radioStationTrack(
  id: string,
): Promise<QueueTrack | null> {
  const station =
    known.get(id) ??
    favoriteStations().find((candidate) => candidate.id === id) ??
    recentStation(id) ??
    (await serverStations()).find((candidate) => candidate.id === id);
  if (!station) return null;
  return {
    id: station.id,
    url: station.streamUrl,
    title: station.name,
    artwork: station.imageUrl,
    artist: station.homePageUrl,
    isRadio: true,
    streamUrl: station.streamUrl,
    homePageUrl: station.homePageUrl,
    source: station.source,
  };
}
