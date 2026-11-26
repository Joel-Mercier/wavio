import { playAudiobook } from "@/services/audiobookshelf/play";
import { getArtistSongs, getSong } from "@/services/backend/browsing";
import { playTracks, refuseHiddenPick } from "@/services/player";
import useQueue, { type QueueSource, type QueueTrack } from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import { childToTrack } from "@/utils/childToTrack";
import { getListing, getTracks } from "./browse";
import { encodeMediaId, type MediaId, parseMediaId } from "./mediaId";
import { mixTracks } from "./providers/mixes";
import { radioStationTrack } from "./providers/radio";

export type Collection = { tracks: QueueTrack[]; source?: QueueSource };

export function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function playSongById(songId: string): Promise<boolean> {
  const rsp = await getSong(songId).catch(() => null);
  if (!rsp?.song) return false;
  return playTracks([childToTrack(rsp.song)], 0);
}

// An artist plays its top songs, which many servers can't supply (Navidrome
// needs a Last.fm key for them); its own songs stand in then.
async function artistCollection(id: string): Promise<Collection | null> {
  const listing = await getListing(encodeMediaId({ kind: "artist", id }));
  if (listing?.tracks?.length) {
    return { tracks: listing.tracks, source: listing.source };
  }
  const rsp = await getArtistSongs(id);
  const songs = rsp.artistSongs?.song ?? [];
  if (songs.length === 0) return null;
  return { tracks: songs.map(childToTrack), source: listing?.source };
}

export async function collectionFor(id: MediaId): Promise<Collection | null> {
  switch (id.kind) {
    case "artist":
      return artistCollection(id.id);
    case "album":
    case "playlist":
    case "favorites":
    case "downloads":
    case "offlineCollection":
      return getTracks(encodeMediaId(id));
    case "genre":
      return mixTracks("genre", id.name);
    case "mix":
      return mixTracks(id.mix, id.arg);
    case "radioStation": {
      const track = await radioStationTrack(id.id);
      return track ? { tracks: [track] } : null;
    }
    default:
      return null;
  }
}

async function playLeaf(parent: string, leafId: string): Promise<boolean> {
  const collection = await getTracks(parent).catch(() => null);
  if (collection) {
    const index = collection.tracks.findIndex((track) => track.id === leafId);
    if (index >= 0) {
      // A hidden tap plays nothing rather than starting a neighbour instead.
      if (refuseHiddenPick(collection.tracks[index])) return false;
      return playTracks(collection.tracks, index, {
        source: collection.source,
      });
    }
  }
  return playSongById(leafId);
}

export async function playCollection(
  collection: Collection | null,
  { shuffle = false }: { shuffle?: boolean } = {},
): Promise<boolean> {
  if (!collection || collection.tracks.length === 0) return false;
  return playTracks(collection.tracks, 0, {
    source: collection.source,
    shuffleFromRandom: true,
    ...(shuffle ? { shuffle: true } : {}),
  });
}

// A play started from the car counts like one started on the phone, so the
// Recent tab and the home shortcuts follow what the driver listens to.
function rememberRecentPlay() {
  const { source, getCurrent } = useQueue.getState();
  const current = getCurrent();
  const { addRecentPlay } = useRecentPlays.getState();
  if (current?.isRadio) {
    addRecentPlay({
      id: current.id,
      title: current.title ?? "",
      type: "internetRadioStation",
      coverArt: current.artwork,
      homePageUrl: current.homePageUrl,
      streamUrl: current.streamUrl,
      source: current.source,
    });
    return;
  }
  if (!source?.id) return;
  if (
    source.type === "album" ||
    source.type === "playlist" ||
    source.type === "artist"
  ) {
    addRecentPlay({
      id: source.id,
      title: source.name,
      type: source.type,
      coverArt: source.coverArt,
    });
  }
}

export async function playMediaId(
  mediaId: string,
  options: { shuffle?: boolean } = {},
): Promise<boolean> {
  const played = await startMediaId(mediaId, options);
  if (played) rememberRecentPlay();
  return played;
}

async function startMediaId(
  mediaId: string,
  options: { shuffle?: boolean },
): Promise<boolean> {
  try {
    if (mediaId.startsWith("track:")) {
      return playSongById(mediaId.slice("track:".length));
    }
    const id = parseMediaId(mediaId);
    if (!id) return false;
    if (id.kind === "track" || id.kind === "episode") {
      return playLeaf(id.parent, id.id);
    }
    if (id.kind === "book") return playAudiobook(id.id);
    return playCollection(await collectionFor(id), options);
  } catch {
    return false;
  }
}
