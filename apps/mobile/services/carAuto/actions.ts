import { queryClient } from "@/config/queryClient";
import { setStarred } from "@/hooks/backend/useMediaAnnotation";
import { getAlbum, getSong } from "@/services/backend/browsing";
import { getPlaylist } from "@/services/backend/playlists";
import { fetchEndlessExtension } from "@/services/endlessRadio";
import { saveCollection } from "@/services/offline/collectionSave";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks, startTrackRadio } from "@/services/player";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";
import { isLibraryTrack } from "@/utils/trackSource";
import { getTracks, invalidateListings, patchNodes } from "./browse";
import {
  encodeMediaId,
  type FavoritesKind,
  type MediaId,
  parseMediaId,
} from "./mediaId";
import { t } from "./nodes";
import { collectionFor, playMediaId, shuffled } from "./play";
import type { BrowseNode, ItemAction } from "./types";

export type ActionResult = {
  ok: boolean;
  message?: string;
  changedParents?: string[];
  staleParents?: string[];
  showPlaying?: boolean;
};

async function leafTrack(
  parent: string,
  leafId: string,
): Promise<QueueTrack | null> {
  const collection = await getTracks(parent).catch(() => null);
  const cached = collection?.tracks.find((track) => track.id === leafId);
  if (cached) return cached;
  const rsp = await getSong(leafId).catch(() => null);
  return rsp?.song ? childToTrack(rsp.song) : null;
}

async function tracksFor(id: MediaId): Promise<QueueTrack[]> {
  if (id.kind === "track" || id.kind === "episode") {
    const track = await leafTrack(id.parent, id.id);
    return track ? [track] : [];
  }
  return (await collectionFor(id))?.tracks ?? [];
}

const entityKey = (id: MediaId): string | null => {
  switch (id.kind) {
    case "track":
      return `song:${id.id}`;
    case "album":
      return `album:${id.id}`;
    case "artist":
      return `artist:${id.id}`;
    default:
      return null;
  }
};

const nodeEntity = (node: BrowseNode): string | null => {
  const id = parseMediaId(node.id);
  return id ? entityKey(id) : null;
};

const favoritesParent = (of: FavoritesKind) =>
  encodeMediaId({ kind: "favorites", of });

const favoriteListings = (kind: "track" | "album" | "artist"): string[] => {
  if (kind === "track") return [favoritesParent("songs")];
  if (kind === "artist") return [favoritesParent("artists")];
  return [
    favoritesParent("albums"),
    encodeMediaId({ kind: "row", key: "starredAlbums" }),
  ];
};

async function toggleFavorite(
  id: MediaId,
  starred: boolean,
): Promise<ActionResult> {
  if (id.kind === "track") {
    const track = await leafTrack(id.parent, id.id);
    await setStarred(
      queryClient,
      { id: id.id, song: track ?? undefined },
      starred,
    );
  } else if (id.kind === "album") {
    await setStarred(queryClient, { albumId: id.id }, starred);
  } else if (id.kind === "artist") {
    await setStarred(queryClient, { artistId: id.id }, starred);
  } else {
    return { ok: false };
  }
  const key = entityKey(id);
  const changedParents = patchNodes(
    (node) => nodeEntity(node) === key,
    (node) => ({
      ...node,
      actions: node.actions?.map((action) =>
        action === "favoriteAdd" || action === "favoriteRemove"
          ? starred
            ? "favoriteRemove"
            : "favoriteAdd"
          : action,
      ),
    }),
  );
  return {
    ok: true,
    message: t(starred ? "actions.favorited" : "actions.unfavorited"),
    changedParents,
    staleParents: favoriteListings(id.kind),
  };
}

async function startRadio(id: MediaId): Promise<ActionResult> {
  if (id.kind === "artist") {
    const ok = await playMediaId(
      encodeMediaId({ kind: "mix", mix: "artist", arg: id.id }),
    );
    return { ok, showPlaying: ok };
  }
  const tracks = (await tracksFor(id)).filter(isLibraryTrack);
  const seed =
    id.kind === "track" ? tracks[0] : (shuffled(tracks)[0] ?? undefined);
  if (!seed) return { ok: false };
  const ok = await startTrackRadio(seed);
  return { ok, showPlaying: ok };
}

async function enqueue(
  id: MediaId,
  position: "next" | "end",
): Promise<ActionResult> {
  const tracks = await tracksFor(id);
  if (tracks.length === 0) return { ok: false };
  const queue = useQueue.getState();
  if (!queue.getCurrent()) {
    return { ok: playTracks(tracks, 0) };
  }
  const added =
    position === "next" ? queue.enqueueNext(tracks) : queue.addToQueue(tracks);
  return {
    ok: added > 0,
    message: t(
      position === "next" ? "actions.playingNext" : "actions.addedToQueue",
      {
        count: added,
      },
    ),
  };
}

async function download(id: MediaId): Promise<ActionResult> {
  let songs: Child[] = [];
  if (id.kind === "album") {
    const { album } = await getAlbum(id.id);
    songs = album.song ?? [];
    void saveCollection(
      {
        id: album.id,
        kind: "album",
        name: album.name,
        coverArt: album.coverArt,
        artist: album.artist,
        artistId: album.artistId,
        year: album.year,
      },
      songs,
    );
  } else if (id.kind === "playlist") {
    const { playlist } = await getPlaylist(id.id);
    songs = playlist.entry ?? [];
    void saveCollection(
      {
        id: playlist.id,
        kind: "playlist",
        name: playlist.name,
        coverArt: playlist.coverArt,
        owner: playlist.owner,
      },
      songs,
    );
  } else {
    return { ok: false };
  }
  const changedParents = patchNodes(
    (node) => node.id === encodeMediaId(id),
    (node) => ({ ...node, download: "downloading" }),
  );
  invalidateListings((parentId) => parentId.startsWith("downloads:"));
  return {
    ok: true,
    message: t("actions.downloading", { count: songs.length }),
    changedParents,
  };
}

export async function runItemAction(
  action: ItemAction,
  mediaId: string,
): Promise<ActionResult> {
  const id = parseMediaId(mediaId);
  if (!id) return { ok: false };
  try {
    switch (action) {
      case "favoriteAdd":
        return await toggleFavorite(id, true);
      case "favoriteRemove":
        return await toggleFavorite(id, false);
      case "radio":
        return await startRadio(id);
      case "playNext":
        return await enqueue(id, "next");
      case "addToQueue":
        return await enqueue(id, "end");
      case "shuffle": {
        const ok = await playMediaId(mediaId, { shuffle: true });
        return { ok, showPlaying: ok };
      }
      case "download":
        return await download(id);
    }
  } catch {
    return { ok: false, message: t("actions.failed") };
  }
}

export async function radioFromCurrentTrack(): Promise<boolean> {
  const queue = useQueue.getState();
  const current = queue.getCurrent();
  const index = queue.currentIndex;
  if (!isLibraryTrack(current) || index == null) return false;
  const extras = await fetchEndlessExtension(current, {
    kept: queue.queue.slice(0, index + 1),
  }).catch(() => [] as QueueTrack[]);
  const after = useQueue.getState();
  if (extras.length === 0 || after.getCurrent()?.id !== current.id)
    return false;
  const upcoming = after.queue
    .map((_, position) => position)
    .filter((position) => position > (after.currentIndex ?? index));
  if (upcoming.length > 0) after.removeAtIndices(upcoming);
  useQueue.getState().enqueueEnd(extras);
  return true;
}
