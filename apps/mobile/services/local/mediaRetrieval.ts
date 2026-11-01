import { activeFileSource } from "@/services/fileSource";
import {
  isPlainTextSidecar,
  parseLyricsSidecar,
  parseLyricsText,
  readLyricsSidecar,
} from "@/services/local/lyricsSidecar";
import { queryTrackLyrics } from "@/services/local/repository";
import { localEnvelope } from "@/services/local/unsupported";
import type { Lyrics, StructuredLyrics } from "@/services/openSubsonic/types";
import { logError } from "@/utils/log";

// Playback itself doesn't go through these dispatched endpoints — the player
// builds a `file://` source synchronously via utils/streaming.ts#streamUrl and
// artwork via utils/artwork.ts#artworkUrl. What's left here is lyrics: the
// lyrics file beside the track, read now so an edit needs no rescan, ahead of
// what the indexer extracted from the tags into `tracks.lyrics`. A `.txt` file
// is the exception: having no timing, it loses to synced embedded lyrics.

const lyricsEnvelope = (structuredLyrics: StructuredLyrics[]) =>
  localEnvelope({ lyricsList: { structuredLyrics } });

export const getLyricsBySongId = async (
  id: string,
  _opts: { enhanced?: boolean } = {},
) => {
  const row = await queryTrackLyrics(id);
  const title = row?.title ?? undefined;
  const artist = row?.artist ?? undefined;
  const embedded = row?.lyrics
    ? parseLyricsText(row.lyrics, title, artist)
    : null;
  const sidecar = row?.lyrics_sidecar;
  if (!sidecar) return lyricsEnvelope(embedded ? [embedded] : []);
  if (embedded?.synced && isPlainTextSidecar(sidecar)) {
    return lyricsEnvelope([embedded]);
  }

  let text: string;
  try {
    text = await readLyricsSidecar(activeFileSource(), sidecar);
  } catch (error) {
    // Rethrown when there is nothing else to show, so a share that's out of
    // reach keeps the last sheet the query cache holds for this track.
    if (!embedded) throw error;
    logError("[localLibrary] Failed to read lyrics file", error);
    return lyricsEnvelope([embedded]);
  }
  const fromSidecar = parseLyricsSidecar(sidecar, text, title, artist);
  if (fromSidecar.length) return lyricsEnvelope(fromSidecar);
  return lyricsEnvelope(embedded ? [embedded] : []);
};

export const getLyrics = async (_params: {
  artist?: string;
  title?: string;
}) => {
  // Legacy by-name lookup; the local index keys lyrics by track id instead.
  const lyrics: Lyrics = {};
  return localEnvelope({ lyrics });
};
